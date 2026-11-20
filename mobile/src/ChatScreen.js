import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Easing,
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
import { WorkLogLive, WorkLogSummary, useReducedMotion, useTypewriter } from './WorkLog'

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
  // When the running turn started, for the timer and the "Worked for" line.
  const [turnStartedAt, setTurnStartedAt] = useState(null)
  const turnStart = useRef(null)
  // The reply that's typing out, which holds back the Transact button it brings.
  const [typingId, setTypingId] = useState(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (busy && turnStart.current === null) turnStart.current = Date.now()
    if (!busy) turnStart.current = null
    setTurnStartedAt(turnStart.current)
  }, [busy])

  const addError = (text) =>
    setMessages((m) => [...m, { id: Crypto.randomUUID(), role: 'agent', text, error: true }])

  // The agent's messages arrive here, whether they answer the user or follow up
  // on a webhook, such as a deposit switch finishing.
  useEffect(
    () =>
      connect((event) => {
        if (event.type === 'message') {
          // A reply that ends a turn says how long it took, and types out.
          const started = turnStart.current
          const message =
            started === null ? event.message : { ...event.message, durationMs: Date.now() - started }
          if (started !== null) setTypingId(message.id)
          setMessages((m) => [...m, message])
        } else if (event.type === 'busy') setBusy(event.busy)
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

  // Sends something to the agent's queue. Shows the loading state until the
  // server reports on the turn, or right away hides it if nothing was queued.
  async function queueForAgent(request) {
    setBusy(true)
    try {
      const queued = await request()
      if (!queued) setBusy(false)
    } catch (err) {
      addError(
        err instanceof TypeError ? 'Could not reach the server. Please try again.' : err.message
      )
      setBusy(false)
    }
  }

  // Newest first, for the inverted list below. An inverted list is anchored to
  // its bottom edge, so the newest message and the loading state stay in view
  // when the keyboard, the Transact button, or a reply typing out takes up room.
  const thread = useMemo(() => [...messages].reverse(), [messages])

  // The latest Transact action, pinned above the composer once the reply that
  // offers it has finished typing.
  const transactMessage = useMemo(
    () => messages.findLast((m) => m.action?.type === 'launch_transact') ?? null,
    [messages]
  )
  const transactAction = transactMessage?.id === typingId ? null : (transactMessage?.action ?? null)

  const placeholder = busy
    ? 'One moment…'
    : messages.some((m) => m.role === 'user')
      ? 'Type your answer'
      : 'Who pays you?'
  const canSend = !busy && !!input.trim()

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
          // It gives way to the list as soon as the agent is busy, so the loading
          // state shows even before the first message.
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
            renderItem={({ item }) => (
              <Message
                item={item}
                styles={styles}
                theme={theme}
                typing={item.id === typingId}
                onTyped={() => setTypingId((id) => (id === item.id ? null : id))}
              />
            )}
            // In an inverted list the header renders at the bottom, under the newest message.
            ListHeaderComponent={
              busy && turnStartedAt !== null ? (
                <WorkLogLive startedAt={turnStartedAt} theme={theme} />
              ) : null
            }
          />
        )}

        {transactAction && (
          <TransactBar
            // A new action starts fresh.
            key={transactAction.id}
            action={transactAction}
            styles={styles}
            // Tells the agent how the user left Transact, so it can follow up.
            onFinish={(data) => queueForAgent(() => sendTransactEvent('finish', data))}
            onClose={(data) => queueForAgent(() => sendTransactEvent('close', data))}
          />
        )}

        <View style={[styles.composer, { paddingBottom: 12 + insets.bottom }]}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={placeholder}
            placeholderTextColor={theme.muted}
            multiline
            maxLength={2000}
            submitBehavior="submit"
            returnKeyType="send"
            onSubmitEditing={() => send(input)}
          />
          <Pressable
            accessibilityLabel="Send"
            disabled={!canSend}
            onPress={() => send(input)}
            style={({ pressed }) => [
              styles.send,
              !canSend && styles.sendDisabled,
              pressed && styles.sendPressed
            ]}
          >
            <ArrowUp styles={styles} />
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

// An up arrow drawn without SVG: a stem, and a chevron made from a square's
// corner turned 45°.
function ArrowUp({ styles }) {
  return (
    <View style={styles.arrow}>
      <View style={styles.arrowHead} />
      <View style={styles.arrowStem} />
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

function Message({ item, styles, theme, typing, onTyped }) {
  if (item.role === 'user') {
    return <UserMessage item={item} styles={styles} />
  }
  if (item.error) {
    return (
      <View style={[styles.agentMessage, styles.errorBubble]}>
        <Text style={styles.errorText}>{item.text}</Text>
      </View>
    )
  }
  return <AgentMessage item={item} theme={theme} typing={typing} onTyped={onTyped} styles={styles} />
}

function UserMessage({ item, styles }) {
  const reduced = useReducedMotion()
  const opacity = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: reduced ? 0 : 200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true
    }).start()
  }, [opacity, reduced])
  return (
    <Animated.View style={[styles.userBubble, { opacity }]}>
      <Text style={styles.userText}>{item.text}</Text>
    </Animated.View>
  )
}

function AgentMessage({ item, theme, typing, onTyped, styles }) {
  const text = useTypewriter(item.text, { animate: typing, onDone: onTyped })
  return (
    <View style={styles.agentMessage}>
      {item.durationMs !== undefined && <WorkLogSummary durationMs={item.durationMs} theme={theme} />}
      {!!text && <Markdown style={markdownStyles(theme)}>{text}</Markdown>}
    </View>
  )
}

// "Update Deposit": the user's confirmation. Only a
// tap opens Transact.
function TransactBar({ action, styles, onFinish, onClose }) {
  // idle → open (Transact on screen) → finished | closed
  const [status, setStatus] = useState('idle')
  // The company's logo from the backend, shown on the button when there is one.
  const logo = action.logo?.url ? action.logo : null
  function open() {
    setStatus('open')
    try {
      launchTransact(action, {
        // Only the fields the agent uses go to it, under the SDK's own names:
        // https://docs.atomicfi.com/reference/transact-sdk#event-listeners__onfinish
        onFinish: (data) => {
          setStatus('finished')
          onFinish?.(pick(data, ['taskId']))
        },
        // Closing isn't an outcome: a switch may have started. Transact includes
        // taskId when a task was created, though the SDK reference doesn't list it.
        // https://docs.atomicfi.com/reference/transact-sdk#event-listeners__onclose
        onClose: (data) => {
          setStatus((s) => (s === 'finished' ? s : 'closed'))
          onClose?.(pick(data, ['taskId']))
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

const markdownStyles = (t) => ({
  body: { color: t.text, fontSize: 15, lineHeight: 24 },
  paragraph: { marginTop: 0, marginBottom: 8 },
  bullet_list: { marginBottom: 8 },
  ordered_list: { marginBottom: 8 },
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
      paddingHorizontal: 24,
      paddingBottom: 12,
      backgroundColor: t.bg,
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
      backgroundColor: t.accent,
      alignItems: 'center',
      justifyContent: 'center'
    },
    avatarLarge: { width: 60, height: 60, borderRadius: 30 },
    avatarText: { color: t.accentText, fontWeight: '600', fontSize: 14 },
    avatarTextLarge: { fontSize: 24 },

    list: { paddingHorizontal: 24, paddingVertical: 16, gap: 20 },
    listEmpty: { flexGrow: 1, justifyContent: 'center' },

    userBubble: {
      alignSelf: 'flex-end',
      maxWidth: '85%',
      backgroundColor: t.accent,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 8
    },
    userText: { color: t.accentText, fontSize: 15, lineHeight: 24 },
    agentMessage: { alignSelf: 'stretch', gap: 12 },
    errorBubble: { backgroundColor: t.errorBg, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12 },
    errorText: { color: t.errorText, fontSize: 15, lineHeight: 24 },

    actionBar: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 16 },
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
      backgroundColor: t.sheet,
      alignItems: 'center',
      justifyContent: 'center'
    },
    actionDoneText: { color: t.text, fontSize: 16, fontWeight: '600' },
    actionNote: { color: t.muted, fontSize: 13, textAlign: 'center' },

    welcome: { alignItems: 'center' },
    welcomeTitle: { fontSize: 24, fontWeight: '700', color: t.text, marginTop: 14 },
    welcomeText: {
      fontSize: 15,
      color: t.muted,
      textAlign: 'center',
      marginTop: 6,
      marginBottom: 18,
      lineHeight: 24
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
      gap: 8,
      paddingTop: 12,
      paddingLeft: 24,
      paddingRight: 16,
      backgroundColor: t.sheet,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20
    },
    input: {
      flex: 1,
      maxHeight: 140,
      minHeight: 40,
      paddingTop: 10,
      paddingBottom: 10,
      color: t.text,
      fontSize: 15
    },
    send: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: t.accent,
      alignItems: 'center',
      justifyContent: 'center'
    },
    sendDisabled: { opacity: 0.4 },
    sendPressed: { transform: [{ scale: 0.94 }] },
    arrow: { width: 20, height: 20, alignItems: 'center' },
    arrowHead: {
      position: 'absolute',
      top: 5,
      width: 10,
      height: 10,
      borderTopWidth: 2,
      borderLeftWidth: 2,
      borderColor: t.accentText,
      borderTopLeftRadius: 1,
      transform: [{ rotate: '45deg' }]
    },
    arrowStem: {
      position: 'absolute',
      top: 5,
      bottom: 4,
      width: 2,
      borderRadius: 1,
      backgroundColor: t.accentText
    }
  })
