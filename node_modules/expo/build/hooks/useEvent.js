import { useEffect, useRef, useState } from 'react';
/**
 * React hook that listens to events emitted by the given object. The returned value is an event parameter
 * that gets updated whenever a new event is dispatched.
 * @param eventEmitter An object that emits events. For example, a native module or shared object or an instance of [`EventEmitter`](#eventemittertype).
 * @param eventName Name of the event to listen to.
 * @param initialValue An event parameter to use until the event is called for the first time.
 * @returns A parameter of the event listener.
 * @example
 * ```tsx
 * import { useEvent } from 'expo';
 * import { VideoPlayer } from 'expo-video';
 *
 * export function PlayerStatus({ videoPlayer }: { videoPlayer: VideoPlayer }) {
 *   const { status } = useEvent(videoPlayer, 'statusChange', { status: videoPlayer.status });
 *
 *   return <Text>{`Player status: ${status}`}</Text>;
 * }
 * ```
 */ export function useEvent(eventEmitter, eventName, initialValue = null) {
    const [event, setEvent] = useState(initialValue);
    const listener = (event)=>setEvent(event);
    useEventListener(eventEmitter, eventName, listener);
    return event;
}
/**
 * React hook that listens to events emitted by the given object and calls the listener function whenever a new event is dispatched.
 * The event listener is automatically added during the first render and removed when the component unmounts.
 * @param eventEmitter An object that emits events. For example, a native module or shared object or an instance of [`EventEmitter`](#eventemittertype).
 * @param eventName Name of the event to listen to.
 * @param listener A function to call when the event is dispatched.
 * @example
 * ```tsx
 * import { useEventListener } from 'expo';
 * import { useVideoPlayer, VideoView } from 'expo-video';
 *
 * export function VideoPlayerView() {
 *   const player = useVideoPlayer(videoSource);
 *
 *   useEventListener(player, 'playingChange', ({ isPlaying }) => {
 *     console.log('Player is playing:', isPlaying);
 *   });
 *
 *   return <VideoView player={player} />;
 * }
 * ```
 */ export function useEventListener(eventEmitter, eventName, listener) {
    // Always use the most recent version of the listener inside the effect,
    // without memoization so the listeners don't have to be swapped with every render.
    const listenerRef = useRef(listener);
    listenerRef.current = listener;
    useEffect(()=>{
        const callback = (...args)=>listenerRef.current(...args);
        const subscription = eventEmitter.addListener(eventName, callback);
        return ()=>subscription.remove();
    }, [
        eventEmitter,
        eventName,
        listenerRef
    ]);
}

//# sourceMappingURL=useEvent.js.map
