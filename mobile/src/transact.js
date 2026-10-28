// Opens Atomic's Transact SDK for a launch_transact action from the backend.
import { Atomic } from '@atomicfi/transact-react-native'

export function launchTransact(action, { onLaunch, onFinish, onClose, onTaskStatusUpdate } = {}) {
  return Atomic.transact({
    config: action.config,
    // { environment: 'custom', apiPath, transactPath? } from the backend, so
    // the SDK talks to the same Atomic API that issued the public token.
    environment: action.environment,
    // https://docs.atomicfi.com/reference/transact-sdk#event-listeners__onlaunch
    onLaunch: (event) => {
      console.log('[transact] launch', event)
      onLaunch?.(event)
    },
    // https://docs.atomicfi.com/reference/transact-sdk#event-listeners__ontaskstatusupdate
    onTaskStatusUpdate: (event) => {
      console.log('[transact] task status', event)
      onTaskStatusUpdate?.(event)
    },
    // https://docs.atomicfi.com/reference/transact-sdk#event-listeners__onfinish
    onFinish: (event) => {
      console.log('[transact] finish', event)
      onFinish?.(event)
    },
    // https://docs.atomicfi.com/reference/transact-sdk#event-listeners__onclose
    onClose: (event) => {
      console.log('[transact] close', event)
      onClose?.(event)
    },
    onError: (error) => console.warn('[transact] error', error)
  })
}
