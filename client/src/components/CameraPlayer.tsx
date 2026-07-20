import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n/I18nContext';

/**
 * Renders a camera's `streamUrl` (spec §9.3: browser-based live view via
 * WebRTC or HLS). HLS is what this component actually plays — via hls.js
 * (a real, widely-used library; hand-rolling an HLS/fMP4 demuxer is not
 * something to do from scratch) for browsers without native support, or the
 * `<video>` element directly on Safari, which plays HLS natively.
 *
 * RTSP (the protocol most physical IP cameras speak) has no browser-native or
 * JS-polyfillable playback path at all — it fundamentally needs a
 * server-side relay that transcodes it to HLS or WebRTC first. That relay is
 * infrastructure this app doesn't run, so an RTSP URL renders a clear
 * explanatory message rather than silently failing. WebRTC playback needs a
 * signaling exchange (SDP offer/answer) specific to whatever server publishes
 * the stream — there's no generic "just point a <video> at a URL" path for
 * it the way there is for HLS, so this component only actually decodes HLS/
 * direct video files; a WebRTC-publishing NVR would need its own small
 * signaling client wired in here later.
 */
export function CameraPlayer({ streamUrl, label }: { streamUrl: string | null; label: string }) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    if (streamUrl.startsWith('rtsp://')) {
      setError(t('cameraRtspNotPlayableNotice'));
      return;
    }

    const isHls = streamUrl.endsWith('.m3u8');
    if (!isHls) {
      // Direct video file — let the browser play it natively.
      video.src = streamUrl;
      return;
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari (and iOS): native HLS support, no library needed.
      video.src = streamUrl;
      return;
    }

    // Dynamically imported: hls.js is a real, sizeable decoder library that
    // only the Cameras page needs — loading it eagerly would double the main
    // bundle for every page in the app (this app has no route-based
    // code-splitting at all yet), so it's fetched as its own chunk only when
    // an HLS stream actually needs playing.
    let destroyed = false;
    let cleanup: (() => void) | undefined;
    import('hls.js').then(({ default: Hls }) => {
      if (destroyed) return;
      if (!Hls.isSupported()) {
        setError(t('cameraHlsUnsupportedNotice'));
        return;
      }
      const hls = new Hls();
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setError(t('cameraStreamErrorNotice', { detail: data.details }));
      });
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      cleanup = () => hls.destroy();
    });

    return () => {
      destroyed = true;
      cleanup?.();
    };
  }, [streamUrl, t]);

  if (!streamUrl) {
    return <div className="camera-feed-placeholder">{t('noStreamUrlConfigured', { label })}</div>;
  }
  if (error) {
    return <div className="camera-feed-placeholder camera-feed-error">{error}</div>;
  }
  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      controls
      className="camera-feed-video"
      onError={() => setError(t('cameraStreamLoadFailedNotice'))}
    />
  );
}
