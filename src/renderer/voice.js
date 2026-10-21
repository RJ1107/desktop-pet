// Voice input shared by the chat bar and the description box:
// record from the microphone, convert to WAV, and have the listening model write down the words.
import {encodeWav, toBase64} from '../shared/wav.js';
import {t} from './i18n.js';

let recorder;

// First click starts recording, second click stops it. `handlers` are {onStart, onBusy, onText, onProblem}.
export async function toggleRecording(button, handlers) {
  if (recorder) return recorder.stop();
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({audio: true}); }
  catch { return handlers.onProblem(t('noMic')); }
  const chunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = event => chunks.push(event.data);
  recorder.onstop = async () => {
    stream.getTracks().forEach(track => track.stop()); recorder = null;
    button.classList.remove('recording'); button.disabled = true;
    handlers.onBusy?.();
    try {
      const audio = new AudioContext({sampleRate: 16000});
      const decoded = await audio.decodeAudioData(await new Blob(chunks).arrayBuffer());
      audio.close();
      const result = await window.petHost.call('listen', toBase64(encodeWav(decoded.getChannelData(0), decoded.sampleRate)));
      if (result.error) handlers.onProblem(result.error);
      else if (!result.text.trim()) handlers.onProblem(t('notCaught'));
      else await handlers.onText(result.text.trim());
    } catch { handlers.onProblem(t('badRecording')); }
    button.disabled = false;
  };
  recorder.start(); button.classList.add('recording'); handlers.onStart?.();
  setTimeout(() => recorder?.state === 'recording' && recorder.stop(), 30000);
}
