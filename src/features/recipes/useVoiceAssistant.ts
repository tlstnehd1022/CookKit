import { useEffect, useRef, useState } from 'react';
import { getSpeechRecognitionCtor, isIosStandalonePwa, type MinimalSpeechRecognition } from '../../lib/cookingVoiceCommands';
import { useSelectedVoiceURI } from '../../data/cookingModeSettings';

/**
 * 요리 모드(1개/여러 개 레시피)가 공유하는 TTS+STT 인프라. 마이크는 한 번 켜면(첫 실행은 브라우저
 * 정책상 사용자 탭 필요) 명령마다 다시 누르지 않아도 계속 듣고(keepListeningRef), 음성 안내가
 * 나오는 동안은 잠깐 멈췄다가(pausedForSpeechRef) 말이 끝나면 자동으로 다시 듣기 시작한다(자기
 * 목소리를 스스로 명령으로 착각해 재실행하는 것 방지). 이 훅은 "무슨 말을 들었는지"만 알려주고
 * (onTranscript) 명령어 해석/실행은 호출부(CookingModePage/MultiCookModePage) 책임이다 — 두
 * 화면의 명령어 집합/라우팅이 다르기 때문(복합 요리는 레시피 이름으로 타이머 대상을 구분해야 함).
 */
export function useVoiceAssistant({
  onTranscript,
}: {
  onTranscript: (transcript: string, speak: (message: string) => void) => void;
}) {
  const [listening, setListening] = useState(false);
  const [lastHeard, setLastHeard] = useState<string | null>(null);
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);
  const keepListeningRef = useRef(false);
  const pausedForSpeechRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const selectedVoiceURI = useSelectedVoiceURI();

  const micCtor = getSpeechRecognitionCtor();
  const micBlockedByIos = isIosStandalonePwa();
  const micSupported = Boolean(micCtor) && !micBlockedByIos;

  useEffect(() => {
    return () => {
      keepListeningRef.current = false;
      window.speechSynthesis?.cancel();
      recognitionRef.current?.stop();
    };
  }, []);

  function speak(text: string) {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    if (selectedVoiceURI) {
      const voice = window.speechSynthesis.getVoices().find((v) => v.voiceURI === selectedVoiceURI);
      if (voice) utterance.voice = voice;
    }
    if (keepListeningRef.current) {
      pausedForSpeechRef.current = true;
      recognitionRef.current?.stop();
      utterance.onend = () => {
        pausedForSpeechRef.current = false;
        if (keepListeningRef.current) recognitionRef.current?.start();
      };
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function startRecognition() {
    if (!micCtor) return;
    const recognition = new micCtor();
    recognition.lang = 'ko-KR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      setLastHeard(transcript);
      onTranscriptRef.current(transcript, speak);
    };
    recognition.onerror = () => {
      // 권한 거부 등은 onend가 뒤이어 호출되므로 재시작 여부는 onend에서 최종 판단한다.
    };
    recognition.onend = () => {
      if (pausedForSpeechRef.current) return; // speak()의 utterance.onend가 재시작을 담당
      if (keepListeningRef.current) {
        setTimeout(() => {
          if (keepListeningRef.current && !pausedForSpeechRef.current) recognitionRef.current?.start();
        }, 250);
      } else {
        setListening(false);
      }
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  function startListening() {
    if (!micCtor || keepListeningRef.current) return;
    keepListeningRef.current = true;
    setListening(true);
    startRecognition();
  }

  function stopListening() {
    if (!keepListeningRef.current) return;
    keepListeningRef.current = false;
    recognitionRef.current?.stop();
    setListening(false);
  }

  function toggleListening() {
    if (!micCtor) return;
    if (keepListeningRef.current) stopListening();
    else startListening();
  }

  return { micSupported, micBlockedByIos, listening, lastHeard, toggleListening, startListening, stopListening, speak };
}
