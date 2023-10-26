'use client'

// React
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState
} from 'react'

// Types
import type { Event, UnsignedEvent } from 'nostr-tools'

// Utils
import {
  generatePrivateKey,
  getEventHash,
  getPublicKey,
  getSignature,
  nip44,
  relayInit
} from 'nostr-tools'
import { useLocalStorage } from 'react-use-storage'

// Hooks
import { useLN } from './LN'

// Interfaces
export interface INostrContext {
  localPublicKey?: string
  localPrivateKey?: string
  relays?: string[]
  ndk: NDK
  generateZapEvent?: (amountMillisats: number, postEventId?: string) => NDKEvent
  subscribeZap?: (eventId: string) => NDKSubscription
  getEvent?: (eventId: string) => Promise<NDKEvent | null>
  publish?: (_event: Event) => Promise<Set<NDKRelay>>
}

const NOSTR_RELAY = process.env.NEXT_PUBLIC_NOSTR_RELAY!

const relays = [NOSTR_RELAY, 'wss://relay.hodl.ar']
const relayPool = relayInit(NOSTR_RELAY)

// Context
const ndk = new NDK({
  explicitRelayUrls: relays
})

export const NostrContext = createContext<INostrContext>({ ndk })

// Component Props
interface INostrProviderProps {
  children: React.ReactNode
}

import NDK, {
  NDKEvent,
  type NDKRelay,
  type NDKSubscription
} from '@nostr-dev-kit/ndk'

export const NostrProvider = ({ children }: INostrProviderProps) => {
  const { recipientPubkey, destination } = useLN()
  // const [privateKey, setPrivateKey] = useState<string>()
  const [privateKey] = useLocalStorage('nostrPrivateKey', generatePrivateKey())
  const [publicKey, setPublicKey] = useState<string>()

  const generateZapEvent = useCallback(
    (amountMillisats: number, postEventId?: string): NDKEvent => {
      const unsignedEvent: UnsignedEvent = {
        kind: 9734,
        content: '',
        pubkey: publicKey!,
        created_at: Math.round(Date.now() / 1000),
        tags: [
          ['relays', ...relays],
          ['amount', amountMillisats.toString()],
          ['lnurl', destination],
          ['p', recipientPubkey]
        ] as string[][]
      }

      postEventId && unsignedEvent.tags.push(['e', postEventId])

      const event = new NDKEvent(ndk, {
        id: getEventHash(unsignedEvent),
        sig: getSignature(unsignedEvent, privateKey!),
        ...unsignedEvent
      })

      console.info('zap event: ')
      console.dir(event)

      return event
    },
    [destination, recipientPubkey, privateKey, publicKey]
  )

  const subscribeZap = (eventId: string): NDKSubscription => {
    console.info(`Listening for zap (${eventId})...`)
    console.info(`Recipient pubkey: ${recipientPubkey}`)
    const sub = ndk.subscribe(
      [
        {
          kinds: [9735],
          authors: [recipientPubkey!],
          '#e': [eventId],
          since: 1693157776
        }
      ],
      {
        closeOnEose: false,
        groupableDelay: 0
      }
    )
    return sub
  }

  const getEvent = async (eventId: string): Promise<NDKEvent | null> => {
    return ndk.fetchEvent({
      ids: [eventId]
    })
  }

  const publish = async (event: Event): Promise<Set<NDKRelay>> => {
    const ndkEvent = new NDKEvent(ndk, event)
    return ndkEvent.publish()
  }

  useEffect(() => {
    console.info('Connecting....')
    void ndk.connect().then(() => {
      console.info('Connected')
    })

    return () => {
      console.info('Unsubscribed')
      relayPool.close()
    }
  }, [])

  useEffect(() => {
    // Generate Public key
    const _publicKey = getPublicKey(privateKey!)

    setPublicKey(_publicKey)
  }, [privateKey])

  return (
    <NostrContext.Provider
      value={{
        localPublicKey: publicKey,
        localPrivateKey: privateKey,
        relays,
        ndk,
        generateZapEvent,
        subscribeZap,
        getEvent,
        publish
      }}
    >
      {children}
    </NostrContext.Provider>
  )
}

// Export hook
export const useNostr = () => {
  return useContext(NostrContext)
}