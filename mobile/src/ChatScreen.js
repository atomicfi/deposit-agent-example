import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Crypto from 'expo-crypto'
import Markdown from 'react-native-markdown-display'
import pick from 'lodash/pick'
import { connect, sendMessage, sendTransactEvent } from './api'
import { launchTransact } from './transact'
import { useTheme } from './theme'

// Atomic's icon, shown on the Transact button. Rendered from Atomic's logo.svg as PNGs
// at 1x, 2x and 3x, since the app doesn't draw SVGs.
const ATOMIC_LOGO = require('../assets/atomic-logo.png')

const SUGGESTIONS = [
  'I get paid through ADP',
  'Can I deposit just part of my paycheck?'
]

export default function ChatScreen() {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const insets = useSafeAreaInsets()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  // Whether the agent is working on a turn, from the server.
  const [busy, setBusy] = useState(false)
  const [connected, setConnected] = useState(false)
  const listRef = useRef(null)

  const addError = (text) =>
    setMessages((m) => [...m, { id: Crypto.randomUUID(), role: 'agent', text, error: true }])

  // The agent's messages arrive here, whether they answer the user or follow up
  // on a webhook, such as a deposit switch finishing.
  useEffect(
    () =>
      connect((event) => {
        if (event.type === 'message') setMessages((m) => [...m, event.message])
        else if (event.type === 'busy') setBusy(event.busy)
        else if (event.type === 'error') addError(event.error)
      }, setConnected),
    []
  )

  function send(text) {
    text = text.trim()
    if (!text || busy) return
    setInput('')
    setMessages((m) => [...m, { id: Crypto.randomUUID(), role: 'user', text }])
    // Back to the newest message, in case the user had scrolled up.
    listRef.current?.scrollToOffset({ offset: 0, animated: true })
    queueForAgent(() => sendMessage(text))
  }

  // Sends something to the agent's queue. Shows the typing indicator until the
  // server reports on the turn.
  async function queueForAgent(request) {
    setBusy(true)
    try {
      await request()
    } catch (err) {
      addError(
        err instanceof TypeError ? 'Could not reach the server. Please try again.' : err.message
      )
      setBusy(false)
    }
  }

  // Newest first, for the inverted list below. An inverted list is anchored to
  // its bottom edge, so the newest message and the typing indicator stay in view
  // when the keyboard or the Transact button takes up room.
  const thread = useMemo(() => [...messages].reverse(), [messages])

  // The latest Transact action, pinned above the composer.
  const transactAction = useMemo(
    () => messages.findLast((m) => m.action?.type === 'launch_transact')?.action ?? null,
    [messages]
  )

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Avatar styles={styles} />
        <View>
          <Text style={styles.title}>Direct Deposit Assistant</Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, !connected && styles.dotOffline]} />
            <Text style={styles.status}>{connected ? 'Online' : 'Connecting…'}</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {messages.length === 0 && !busy ? (
          // The welcome screen sits outside the inverted list, which would flip it.
          // It gives way to the list as soon as the agent is busy, so the typing
          // indicator shows even before the first message.
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.list, styles.listEmpty]}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          >
            <Welcome styles={styles} onPick={send} />
          </ScrollView>
        ) : (
          <FlatList
            ref={listRef}
            style={styles.flex}
            contentContainerStyle={styles.list}
            inverted
            data={thread}
            keyExtractor={(m) => m.id}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => <Message item={item} styles={styles} theme={theme} />}
            // In an inverted list the header renders at the bottom, under the newest message.
            ListHeaderComponent={busy ? <TypingIndicator styles={styles} /> : null}
          />
        )}

        {transactAction && (
          <TransactBar
            // A new action starts fresh.
            key={transactAction.id}
            action={transactAction}
            styles={styles}
            // Tells the agent how the user left Transact, so it can follow up.
            onDone={(event, data) => queueForAgent(() => sendTransactEvent(event, data))}
          />
        )}

        <View
          style={[
            styles.composer,
            transactAction && styles.composerJoined,
            { paddingBottom: Math.max(insets.bottom, 12) }
          ]}
        >
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message Direct Deposit Assistant…"
            placeholderTextColor={theme.muted}
            multiline
            submitBehavior="submit"
            returnKeyType="send"
            onSubmitEditing={() => send(input)}
          />
          <Pressable
            accessibilityLabel="Send"
            disabled={busy || !input.trim()}
            onPress={() => send(input)}
            style={({ pressed }) => [
              styles.send,
              (busy || !input.trim()) && styles.sendDisabled,
              pressed && styles.sendPressed
            ]}
          >
            <Text style={styles.sendIcon}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

function Avatar({ styles, large }) {
  return (
    <View style={[styles.avatar, large && styles.avatarLarge]}>
      <Text style={[styles.avatarText, large && styles.avatarTextLarge]}>A</Text>
    </View>
  )
}

function Welcome({ styles, onPick }) {
  return (
    <View style={styles.welcome}>
      <Avatar styles={styles} large />
      <Text style={styles.welcomeTitle}>How can I help?</Text>
      <Text style={styles.welcomeText}>
        I can find who pays you and help you move your direct deposit to this account.
      </Text>
      <View style={styles.suggestions}>
        {SUGGESTIONS.map((s) => (
          <Pressable
            key={s}
            onPress={() => onPick(s)}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
          >
            <Text style={styles.chipText}>{s}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

function Message({ item, styles, theme }) {
  if (item.role === 'user') {
    return (
      <View style={[styles.row, styles.rowUser]}>
        <View style={[styles.bubble, styles.userBubble]}>
          <Text style={styles.userText}>{item.text}</Text>
        </View>
      </View>
    )
  }
  return (
    <View style={styles.row}>
      <Avatar styles={styles} />
      <View style={styles.agentColumn}>
        <View style={[styles.bubble, styles.agentBubble, item.error && styles.errorBubble]}>
          {item.error ? (
            <Text style={styles.errorText}>{item.text}</Text>
          ) : (
            <Markdown style={markdownStyles(theme)}>{item.text}</Markdown>
          )}
        </View>
      </View>
    </View>
  )
}

// "Update deposit at <company>": the user's confirmation. Only a
// tap opens Transact.
function TransactBar({ action, styles, onDone }) {
  // idle → open (Transact on screen) → finished | closed
  const [status, setStatus] = useState('idle')
  // The company's logo from the backend, shown on the button when there is one.
  const logo = action.logo?.url ? action.logo : null
  // Transact can report both finish and close; signal the agent once per open,
  // with whichever came first.
  const signalled = useRef(false)

  function done(event, data) {
    if (signalled.current) return
    signalled.current = true
    onDone?.(event, data)
  }

  function open() {
    setStatus('open')
    signalled.current = false
    try {
      launchTransact(action, {
        // Only the fields the agent uses go to it, under the SDK's own names:
        // https://docs.atomicfi.com/reference/transact-sdk#event-listeners__onfinish
        onFinish: (data) => {
          setStatus('finished')
          done('finish', pick(data, ['taskId']))
        },
        // Closing isn't an outcome: Transact may keep working briefly after.
        onClose: (data) => {
          setStatus((s) => (s === 'finished' ? s : 'closed'))
          // https://docs.atomicfi.com/reference/transact-sdk#event-listeners__onclose
          done('close', pick(data, ['reason']))
        }
      })
    } catch (err) {
      console.warn('[transact] could not open', err)
      setStatus('idle')
    }
  }

  if (status === 'finished') {
    return (
      <View style={styles.actionBar}>
        <View style={styles.actionDone}>
          <Text style={styles.actionDoneText}>✓ {action.finishedLabel}</Text>
        </View>
      </View>
    )
  }
  // After a close, the agent decides what happens next. A task may still be
  // running, and reopening the same action could start a duplicate, so the
  // button goes away; the agent issues a new one if the user wants to retry.
  if (status === 'closed') {
    return (
      <View style={styles.actionBar}>
        <Text style={styles.actionNote}>Closed. Ask the assistant if you want to try again.</Text>
      </View>
    )
  }
  return (
    <View style={styles.actionBar}>
      <Pressable
        accessibilityRole="button"
        disabled={status === 'open'}
        onPress={open}
        style={({ pressed }) => [
          styles.actionButton,
          status === 'open' && styles.actionButtonBusy,
          pressed && styles.actionButtonPressed
        ]}
      >
        {logo && (
          <View style={styles.actionLogoSlot}>
            <View style={[styles.actionLogo, { backgroundColor: logo.backgroundColor ?? '#ffffff' }]}>
              <Image source={{ uri: logo.url }} style={styles.actionLogoImage} resizeMode="contain" />
            </View>
          </View>
        )}
        <View style={styles.actionButtonLabels}>
          <Text style={styles.actionButtonText}>
            {status === 'open' ? 'Opening…' : action.label}
          </Text>
          <Text style={styles.actionButtonSub}>Securely through Atomic</Text>
        </View>
        <View style={[styles.actionLogoSlot, styles.actionLogoSlotRight]}>
          <Image source={ATOMIC_LOGO} style={styles.atomicLogo} resizeMode="contain" />
        </View>
      </Pressable>
    </View>
  )
}

function TypingIndicator({ styles }) {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current
  useEffect(() => {
    const anims = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.delay((2 - i) * 150)
        ])
      )
    )
    anims.forEach((a) => a.start())
    return () => anims.forEach((a) => a.stop())
  }, [dots])

  return (
    <View style={styles.row} accessibilityLabel="Assistant is typing">
      <Avatar styles={styles} />
      <View style={[styles.bubble, styles.agentBubble, styles.typing]}>
        {dots.map((v, i) => (
          <Animated.View key={i} style={[styles.typingDot, { opacity: v }]} />
        ))}
      </View>
    </View>
  )
}

const markdownStyles = (t) => ({
  body: { color: t.text, fontSize: 16, lineHeight: 22 },
  paragraph: { marginTop: 0, marginBottom: 6 },
  bullet_list: { marginBottom: 6 },
  ordered_list: { marginBottom: 6 },
  strong: { fontWeight: '600' },
  link: { color: t.accent },
  code_inline: { backgroundColor: t.codeBg, color: t.text, borderRadius: 4, fontSize: 14 },
  fence: { backgroundColor: t.codeBg, color: t.text, borderWidth: 0, borderRadius: 8 },
  code_block: { backgroundColor: t.codeBg, color: t.text, borderWidth: 0, borderRadius: 8 }
})

const makeStyles = (t) =>
  StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: t.bg },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingBottom: 12,
      backgroundColor: t.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border
    },
    title: { fontSize: 17, fontWeight: '600', color: t.text },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.online },
    dotOffline: { backgroundColor: t.muted },
    status: { fontSize: 12, color: t.muted },

    avatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      // Atomic's brand purple (indigo-500 on docs.atomicfi.com).
      backgroundColor: '#6035DB',
      alignItems: 'center',
      justifyContent: 'center'
    },
    avatarLarge: { width: 60, height: 60, borderRadius: 30 },
    avatarText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    avatarTextLarge: { fontSize: 24 },

    list: { padding: 16, gap: 14 },
    listEmpty: { flexGrow: 1, justifyContent: 'center' },

    row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    rowUser: { justifyContent: 'flex-end' },
    bubble: { maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
    userBubble: { backgroundColor: t.accent, borderBottomRightRadius: 6 },
    userText: { color: t.accentText, fontSize: 16, lineHeight: 22 },
    agentBubble: {
      maxWidth: '100%',
      backgroundColor: t.agentBubble,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
      borderBottomLeftRadius: 6,
      paddingBottom: 4
    },
    agentColumn: { flexShrink: 1, maxWidth: '80%', gap: 8, alignItems: 'flex-start' },
    actionBar: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 4,
      backgroundColor: t.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.border
    },
    actionButton: {
      backgroundColor: t.surface,
      minHeight: 60,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: t.border,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2
    },
    // Room on both sides for the logos, so the labels stay centered on the button.
    actionButtonLabels: { alignItems: 'center', paddingHorizontal: 40 },
    // Pins a logo to the button's left edge, vertically centered, outside the
    // labels' layout. actionLogoSlotRight moves it to the right edge.
    actionLogoSlot: {
      position: 'absolute',
      left: 14,
      top: 0,
      bottom: 0,
      justifyContent: 'center'
    },
    actionLogoSlotRight: { left: undefined, right: 14 },
    atomicLogo: { width: 36, height: 31 },
    // The company's logo on its own background color, like an app icon.
    actionLogo: {
      width: 36,
      height: 36,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden'
    },
    actionLogoImage: { width: 28, height: 28 },
    actionButtonBusy: { opacity: 0.6 },
    actionButtonPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
    actionButtonText: { color: t.text, fontSize: 18, fontWeight: '700' },
    actionButtonSub: { color: t.muted, fontSize: 12, marginTop: 2 },
    actionDone: {
      minHeight: 52,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.bg,
      alignItems: 'center',
      justifyContent: 'center'
    },
    actionDoneText: { color: t.text, fontSize: 16, fontWeight: '600' },
    actionNote: { color: t.muted, fontSize: 13, marginTop: 8, textAlign: 'center' },
    errorBubble: { backgroundColor: t.errorBg, borderColor: 'transparent', paddingBottom: 10 },
    errorText: { color: t.errorText, fontSize: 16, lineHeight: 22 },

    typing: { flexDirection: 'row', gap: 5, paddingVertical: 15, paddingBottom: 15 },
    typingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.muted },

    welcome: { alignItems: 'center', paddingHorizontal: 12 },
    welcomeTitle: { fontSize: 24, fontWeight: '700', color: t.text, marginTop: 14 },
    welcomeText: {
      fontSize: 15,
      color: t.muted,
      textAlign: 'center',
      marginTop: 6,
      marginBottom: 18,
      lineHeight: 21
    },
    suggestions: { gap: 10, alignItems: 'center' },
    chip: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface
    },
    chipPressed: { borderColor: t.accent },
    chipText: { color: t.text, fontSize: 15 },

    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
      paddingHorizontal: 12,
      paddingTop: 10,
      backgroundColor: t.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.border
    },
    // Under the Transact bar, which already draws the divider.
    composerJoined: { borderTopWidth: 0 },
    input: {
      flex: 1,
      maxHeight: 140,
      minHeight: 42,
      paddingHorizontal: 16,
      paddingTop: 11,
      paddingBottom: 11,
      borderRadius: 21,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.bg,
      color: t.text,
      fontSize: 16
    },
    send: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: t.accent,
      alignItems: 'center',
      justifyContent: 'center'
    },
    sendDisabled: { opacity: 0.4 },
    sendPressed: { transform: [{ scale: 0.94 }] },
    sendIcon: { color: t.accentText, fontSize: 22, fontWeight: '700', marginTop: -2 }
  })
