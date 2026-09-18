import { getAudioEngine } from './AudioEngine';

export let midiLearnTarget: string | null = null;

export function setMidiLearnTarget(target: string | null) {
  midiLearnTarget = target;
}

export let TRAKTOR_S2_MAP: Record<string, number | string> = {
  // Deck A Transport & Performance
  DECK_A_SYNC_BTN: 0x0A,
  DECK_A_PLAY_BTN: 0x0B, 
  DECK_A_CUE_BTN: 0x0C,
  DECK_A_LOOP_BTN: 0x0D,
  DECK_A_KEYLOCK: 0x0E,
  DECK_A_PFL_CUE: 0x0F,
  
  DECK_A_HOTCUE_1: 0x40,
  DECK_A_HOTCUE_2: 0x41,
  DECK_A_HOTCUE_3: 0x42,
  DECK_A_HOTCUE_4: 0x43,
  DECK_A_HOTCUE_5: 0x44,
  DECK_A_HOTCUE_6: 0x45,
  DECK_A_HOTCUE_7: 0x46,
  DECK_A_HOTCUE_8: 0x47,

  // Deck A Jog Wheel (Traktor S2 Defaults)
  DECK_A_JOG_TURN: 0x19,
  DECK_A_JOG_TOUCH: 0x26,

  // Deck A Mixer & EQ
  DECK_A_VOLUME: 0x00, 
  DECK_A_TRIM: 0x01,
  DECK_A_EQ_HIGH: 0x02, 
  DECK_A_EQ_MID: 0x03, 
  DECK_A_EQ_LOW: 0x04, 
  DECK_A_FILTER: 0x05,
  DECK_A_PITCH: 0x06,

  // Deck B Transport & Performance
  DECK_B_SYNC_BTN: 0x1A,
  DECK_B_PLAY_BTN: 0x1B, 
  DECK_B_CUE_BTN: 0x1C,
  DECK_B_LOOP_BTN: 0x1D,
  DECK_B_KEYLOCK: 0x1E,
  DECK_B_PFL_CUE: 0x1F,

  DECK_B_HOTCUE_1: 0x50,
  DECK_B_HOTCUE_2: 0x51,
  DECK_B_HOTCUE_3: 0x52,
  DECK_B_HOTCUE_4: 0x53,
  DECK_B_HOTCUE_5: 0x54,
  DECK_B_HOTCUE_6: 0x55,
  DECK_B_HOTCUE_7: 0x56,
  DECK_B_HOTCUE_8: 0x57,

  // Deck B Jog Wheel (Traktor S2 Defaults)
  DECK_B_JOG_TURN: 0x1A,
  DECK_B_JOG_TOUCH: 0x27,

  // Deck B Mixer & EQ
  DECK_B_VOLUME: 0x10, 
  DECK_B_TRIM: 0x11,
  DECK_B_EQ_HIGH: 0x12, 
  DECK_B_EQ_MID: 0x13, 
  DECK_B_EQ_LOW: 0x14, 
  DECK_B_FILTER: 0x15,
  DECK_B_PITCH: 0x16,

  // Mixer / Master & Headphone CUE
  CROSSFADER: 0x20, 
  MASTER_VOLUME: 0x21,
  HEADPHONE_VOLUME: 0x22,
  CUE_MIX: 0x23,
  
  // Browser Actions
  BROWSER_ENCODER: 0x30, 
  BROWSER_LOAD_A: 0x31, 
  BROWSER_LOAD_B: 0x32  
};

export function initTraktorMIDI() {
  if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(access => {
      for (const input of access.inputs.values()) {
        input.addEventListener('midimessage', onMidiMessage);
      }
      access.addEventListener('statechange', () => {
        for (const input of access.inputs.values()) {
          input.removeEventListener('midimessage', onMidiMessage);
          input.addEventListener('midimessage', onMidiMessage);
        }
      });
    }).catch(err => {
      console.error('MIDI Access failed', err);
    });
  }
}

// Store previous control values for edge detection
const previousValues: Record<string, number> = {};

function onMidiMessage(event: any) {
  const [status, data1, data2] = event.data;
  const eventKey = `${status}-${data1}`;
  
  if (midiLearnTarget && data1 !== undefined) {
    TRAKTOR_S2_MAP[midiLearnTarget] = eventKey;
    window.dispatchEvent(new CustomEvent('dj-midi-learned', { 
      detail: { controlName: midiLearnTarget, midiCC: data1 } 
    }));
    midiLearnTarget = null;
    return;
  }

  const engine = getAudioEngine();
  const normalizedValue = data2 / 127; // 0 to 1

  let matchedControl: string | null = null;
  
  // 1. Try exact custom mapping first
  for (const [key, val] of Object.entries(TRAKTOR_S2_MAP)) {
    if (val === eventKey) {
      matchedControl = key;
      break;
    }
  }

  // 2. Fall back to default data1 mapping if not custom mapped
  if (!matchedControl) {
    for (const [key, val] of Object.entries(TRAKTOR_S2_MAP)) {
      if (val === data1 && typeof val === 'number') {
        matchedControl = key;
        break;
      }
    }
  }

  // Support standard DJ Jog Wheel Pitch Bend messages (0xE0..0xEF)
  if ((status & 0xF0) === 0xE0) {
    const channel = status & 0x0F;
    const deck = channel === 0 ? 'A' : 'B';
    const pbVal = (data2 << 7) | data1;
    const center = 8192;
    const delta = Math.round((pbVal - center) / 256);
    if (delta !== 0) {
      window.dispatchEvent(new CustomEvent('dj-jog', { detail: { deck, delta } }));
    }
    return;
  }

  if (!matchedControl) return;

  const prevData2 = previousValues[matchedControl] || 0;
  const isPress = data2 > 64 && prevData2 <= 64;
  const isRelease = data2 <= 64 && prevData2 > 64;
  previousValues[matchedControl] = data2;

  // Route to engine
  switch (matchedControl) {
    // Deck A Continuous
    case 'DECK_A_VOLUME': engine.deckA.setVolume(normalizedValue); break;
    case 'DECK_A_TRIM': engine.deckA.setTrim(normalizedValue); break;
    case 'DECK_A_EQ_HIGH': engine.deckA.setEqHigh(normalizedValue); break;
    case 'DECK_A_EQ_MID': engine.deckA.setEqMid(normalizedValue); break;
    case 'DECK_A_EQ_LOW': engine.deckA.setEqLow(normalizedValue); break;
    case 'DECK_A_FILTER': engine.deckA.setFilter(normalizedValue); break;
    case 'DECK_A_PITCH': engine.deckA.setPitch(normalizedValue); break;
    
    // Deck A Buttons
    case 'DECK_A_SYNC_BTN':
      if (isPress) window.dispatchEvent(new CustomEvent('dj-sync', { detail: { deck: 'A' } }));
      break;
    case 'DECK_A_PLAY_BTN':
      if (isPress) {
        if (engine.deckA.isPlaying) engine.deckA.pause();
        else engine.deckA.play();
      }
      break;
    case 'DECK_A_CUE_BTN':
      if (isPress) {
        if (!engine.deckA.isPlaying) {
          engine.deckA.setCuePoint();
        } else {
          engine.deckA.jumpToCue();
        }
      } else if (isRelease) {
        if (engine.deckA.isPlaying) {
          engine.deckA.pause();
          engine.deckA.jumpToCue();
        }
      }
      break;
    case 'DECK_A_LOOP_BTN':
      if (isPress) engine.deckA.toggleLoop();
      break;
    case 'DECK_A_KEYLOCK':
      if (isPress) engine.deckA.setKeylock(!engine.deckA.keylock);
      break;
    case 'DECK_A_PFL_CUE':
      if (isPress) engine.toggleCueA();
      break;
    case 'DECK_A_HOTCUE_1':
      if (isPress) engine.deckA.jumpToHotCue(0);
      break;
    case 'DECK_A_HOTCUE_2':
      if (isPress) engine.deckA.jumpToHotCue(1);
      break;
    case 'DECK_A_HOTCUE_3':
      if (isPress) engine.deckA.jumpToHotCue(2);
      break;
    case 'DECK_A_HOTCUE_4':
      if (isPress) engine.deckA.jumpToHotCue(3);
      break;
    case 'DECK_A_HOTCUE_5':
      if (isPress) engine.deckA.jumpToHotCue(4);
      break;
    case 'DECK_A_HOTCUE_6':
      if (isPress) engine.deckA.jumpToHotCue(5);
      break;
    case 'DECK_A_HOTCUE_7':
      if (isPress) engine.deckA.jumpToHotCue(6);
      break;
    case 'DECK_A_HOTCUE_8':
      if (isPress) engine.deckA.jumpToHotCue(7);
      break;

    // Deck A Jog Wheel
    case 'DECK_A_JOG_TURN': {
      let delta = 0;
      if (data2 >= 1 && data2 <= 32) delta = data2;
      else if (data2 >= 96 && data2 <= 127) delta = data2 - 128;
      else if (data2 > 64 && data2 < 96) delta = data2 - 64;
      else if (data2 >= 32 && data2 < 64) delta = data2 - 64;
      else if (data2 === 64) delta = 0;
      else {
        const prev = prevData2;
        delta = data2 - prev;
        if (delta > 64) delta -= 128;
        if (delta < -64) delta += 128;
      }
      if (delta !== 0) {
        window.dispatchEvent(new CustomEvent('dj-jog', { detail: { deck: 'A', delta } }));
      }
      break;
    }
    case 'DECK_A_JOG_TOUCH': {
      const isNoteOn = (status & 0xF0) === 0x90 && data2 > 0;
      const isCCTouch = (status & 0xF0) === 0xB0 && data2 > 0;
      const isTouch = isNoteOn || isCCTouch;
      window.dispatchEvent(new CustomEvent('dj-jog-touch', { detail: { deck: 'A', touched: isTouch } }));
      break;
    }

    // Deck B Continuous
    case 'DECK_B_VOLUME': engine.deckB.setVolume(normalizedValue); break;
    case 'DECK_B_TRIM': engine.deckB.setTrim(normalizedValue); break;
    case 'DECK_B_EQ_HIGH': engine.deckB.setEqHigh(normalizedValue); break;
    case 'DECK_B_EQ_MID': engine.deckB.setEqMid(normalizedValue); break;
    case 'DECK_B_EQ_LOW': engine.deckB.setEqLow(normalizedValue); break;
    case 'DECK_B_FILTER': engine.deckB.setFilter(normalizedValue); break;
    case 'DECK_B_PITCH': engine.deckB.setPitch(normalizedValue); break;

    // Deck B Buttons
    case 'DECK_B_SYNC_BTN':
      if (isPress) window.dispatchEvent(new CustomEvent('dj-sync', { detail: { deck: 'B' } }));
      break;
    case 'DECK_B_PLAY_BTN':
      if (isPress) {
        if (engine.deckB.isPlaying) engine.deckB.pause();
        else engine.deckB.play();
      }
      break;
    case 'DECK_B_CUE_BTN':
      if (isPress) {
        if (!engine.deckB.isPlaying) {
          engine.deckB.setCuePoint();
        } else {
          engine.deckB.jumpToCue();
        }
      } else if (isRelease) {
        if (engine.deckB.isPlaying) {
          engine.deckB.pause();
          engine.deckB.jumpToCue();
        }
      }
      break;
    case 'DECK_B_LOOP_BTN':
      if (isPress) engine.deckB.toggleLoop();
      break;
    case 'DECK_B_KEYLOCK':
      if (isPress) engine.deckB.setKeylock(!engine.deckB.keylock);
      break;
    case 'DECK_B_PFL_CUE':
      if (isPress) engine.toggleCueB();
      break;
    case 'DECK_B_HOTCUE_1':
      if (isPress) engine.deckB.jumpToHotCue(0);
      break;
    case 'DECK_B_HOTCUE_2':
      if (isPress) engine.deckB.jumpToHotCue(1);
      break;
    case 'DECK_B_HOTCUE_3':
      if (isPress) engine.deckB.jumpToHotCue(2);
      break;
    case 'DECK_B_HOTCUE_4':
      if (isPress) engine.deckB.jumpToHotCue(3);
      break;
    case 'DECK_B_HOTCUE_5':
      if (isPress) engine.deckB.jumpToHotCue(4);
      break;
    case 'DECK_B_HOTCUE_6':
      if (isPress) engine.deckB.jumpToHotCue(5);
      break;
    case 'DECK_B_HOTCUE_7':
      if (isPress) engine.deckB.jumpToHotCue(6);
      break;
    case 'DECK_B_HOTCUE_8':
      if (isPress) engine.deckB.jumpToHotCue(7);
      break;

    // Deck B Jog Wheel
    case 'DECK_B_JOG_TURN': {
      let delta = 0;
      if (data2 >= 1 && data2 <= 32) delta = data2;
      else if (data2 >= 96 && data2 <= 127) delta = data2 - 128;
      else if (data2 > 64 && data2 < 96) delta = data2 - 64;
      else if (data2 >= 32 && data2 < 64) delta = data2 - 64;
      else if (data2 === 64) delta = 0;
      else {
        const prev = prevData2;
        delta = data2 - prev;
        if (delta > 64) delta -= 128;
        if (delta < -64) delta += 128;
      }
      if (delta !== 0) {
        window.dispatchEvent(new CustomEvent('dj-jog', { detail: { deck: 'B', delta } }));
      }
      break;
    }
    case 'DECK_B_JOG_TOUCH': {
      const isNoteOn = (status & 0xF0) === 0x90 && data2 > 0;
      const isCCTouch = (status & 0xF0) === 0xB0 && data2 > 0;
      const isTouch = isNoteOn || isCCTouch;
      window.dispatchEvent(new CustomEvent('dj-jog-touch', { detail: { deck: 'B', touched: isTouch } }));
      break;
    }

    // Mixer & Headphone Cue
    case 'CROSSFADER': engine.updateCrossfader(normalizedValue); break;
    case 'MASTER_VOLUME': engine.setMasterVolume(normalizedValue); break;
    case 'HEADPHONE_VOLUME': engine.setCueVolume(normalizedValue); break;
    case 'CUE_MIX': engine.setCueMix(normalizedValue); break;

    // Browser Actions
    case 'BROWSER_ENCODER':
      let delta = 0;
      if (data2 > 0 && data2 < 64) delta = data2;
      else if (data2 >= 64) delta = -(128 - data2);
      if (delta !== 0) window.dispatchEvent(new CustomEvent('dj-browser-nav', { detail: { delta } }));
      break;
    case 'BROWSER_LOAD_A':
      if (data2 > 64) window.dispatchEvent(new CustomEvent('dj-browser-load', { detail: { deck: 'A' } }));
      break;
    case 'BROWSER_LOAD_B':
      if (data2 > 64) window.dispatchEvent(new CustomEvent('dj-browser-load', { detail: { deck: 'B' } }));
      break;
  }

  // Dispatch global event for UI updates
  window.dispatchEvent(new CustomEvent('dj-control', { detail: { status, controlName: matchedControl, value: data2, normalized: normalizedValue } }));
}
