import { useState, useRef } from 'react';

export function useRecorder(onStop:(blob:Blob)=>void) {
  const [recording, setRecording] = useState(false);
  const mediaRef = useRef<MediaRecorder|null>(null);
  const chunks = useRef<BlobPart[]>([]);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    chunks.current = [];
    mediaRef.current.ondataavailable = e => chunks.current.push(e.data);
    mediaRef.current.onstop = () => onStop(new Blob(chunks.current, { type: 'audio/webm' }));
    mediaRef.current.start(200);
    setRecording(true);
  }

  function stop() {
    if (!mediaRef.current) return;
    mediaRef.current.stop();
    mediaRef.current.stream.getTracks().forEach(t => t.stop());
    setRecording(false);
  }

  return { recording, start, stop };
}
