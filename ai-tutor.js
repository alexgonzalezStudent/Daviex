/**
 * Eihwaz Tutor Service (Caché Dinámico v15 - Autocorrector Musical y Mentor Inmersivo)
 */

const CLOUDFLARE_WORKER_URL = "https://eihwaz-mentor.alexandergrf2003.workers.dev";

const AI_MODELS = [
  'gemini-1.5-pro-latest',
  'gemini-1.5-flash-latest'
];

const PRESET_WORDS = {
  "unstoppable": {
    "word_en": "Unstoppable", "word_es": "Imparable",
    "real_life_context": "Se usa cuando tienes tanta determinación y enfoque en tu meta que ningún obstáculo puede frenarte.",
    "power_phrase_en": "With discipline and faith, I am unstoppable today.",
    "power_phrase_es": "Con disciplina y fe, hoy soy imparable.",
    "pronunciation_tip": "Empieza con un sonido corto 'an-' (no 'un-'), marca fuerte '-STOP-' y termina suave en '-a-bol'."
  },
  "lean on me": {
    "word_en": "Lean on me", "word_es": "Apóyate en mí / Cuenta conmigo",
    "real_life_context": "Frase de lealtad total para decirle a un amigo o familiar que puede confiar en ti cuando las cosas se ponen difíciles.",
    "power_phrase_en": "When times get tough, you can always lean on me.",
    "power_phrase_es": "Cuando los tiempos se pongan difíciles, siempre puedes apoyarte en mí.",
    "pronunciation_tip": "Une la 'n' de 'lean' con la 'o' de 'on' para que suene fluido como 'lín-on-mi'."
  },
  "relentless": {
    "word_en": "Relentless", "word_es": "Implacable / Incansable",
    "real_life_context": "Describe a alguien que insiste una y otra vez sin rendirse jamás hasta dominar una habilidad.",
    "power_phrase_en": "Stay relentless in pursuit of your dreams.",
    "power_phrase_es": "Mantente incansable en la búsqueda de tus sueños.",
    "pronunciation_tip": "Suena 'ri-LENT-les'. Dale fuerza a la sílaba del medio y suelta el final suave."
  },
  "grace": {
    "word_en": "Grace", "word_es": "Gracia / Paz inmerecida",
    "real_life_context": "Se usa tanto para hablar de favor espiritual y perdón como para describir elegancia y calma bajo presión.",
    "power_phrase_en": "Grace gives me the strength to start again.",
    "power_phrase_es": "La gracia me da la fuerza para empezar de nuevo.",
    "pronunciation_tip": "Pronúncialo como 'greis', abriendo ligeramente la sonrisa en la 'ei' y cerrando con una 's' limpia."
  }
};

class AITutor {
  constructor() {
    this.storageKey = 'eihwaz_gemini_api_key';
    this.cacheKey = 'eihwaz_smart_cache_v15';
    this.lastRequestTime = 0;
  }

  getApiKey() { return localStorage.getItem(this.storageKey) || ''; }
  setApiKey(key) { localStorage.setItem(this.storageKey, key.trim()); }
  hasKey() { return !!this.getApiKey(); }
  hasProxy() { return CLOUDFLARE_WORKER_URL.trim().length > 0; }
  isReady() { return this.hasProxy() || this.hasKey(); }

  getFromCache(key) {
    try { 
      const item = JSON.parse(localStorage.getItem(this.cacheKey) || '{}')[key.toLowerCase().trim()];
      if (item && item.word_es && item.word_es !== "Traducción en proceso") return item;
      return null;
    } catch (e) { return null; }
  }

  saveToCache(key, data) {
    try {
      const cache = JSON.parse(localStorage.getItem(this.cacheKey) || '{}');
      cache[key.toLowerCase().trim()] = data;
      localStorage.setItem(this.cacheKey, JSON.stringify(cache));
    } catch (err) {}
  }

  validateInput(text, maxLen = 120) {
    const clean = text.trim();
    if (clean.length < 2) throw new Error('Escribe al menos 2 letras.');
    if (clean.length > maxLen) throw new Error(`Texto muy largo (máximo ${maxLen} caracteres).`);
    const now = Date.now();
    if (now - this.lastRequestTime < 1000) throw new Error('¡Vas muy rápido! Espera un momento.');
    this.lastRequestTime = now;
  }

  async callGeminiRaw(prompt) {
    let rawText = "";
    if (this.hasProxy()) {
      const response = await fetch(CLOUDFLARE_WORKER_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      if (!response.ok) throw new Error(`Servidor ocupado (${response.status})`);
      rawText = await response.text();
    } else {
      const key = this.getApiKey();
      if (!key) throw new Error('NO_API_KEY');
      
      let lastError = null;
      for (const model of AI_MODELS) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
          const response = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.7 }
            })
          });
          if (response.ok) {
            const data = await response.json();
            rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
            break;
          }
        } catch (err) { lastError = err; }
      }
      if (!rawText) throw lastError || new Error("Fallo en conexión");
    }
    return rawText;
  }

  async exploreWord(word) {
    const cleanKey = word.toLowerCase().trim();
    if (PRESET_WORDS[cleanKey]) return PRESET_WORDS[cleanKey];
    const cached = this.getFromCache(`word_${cleanKey}`);
    if (cached) return cached;
    this.validateInput(word, 65);

    const prompt = `
Eres Eihwaz 🦬, mentor de inglés de élite. Analiza la palabra o frase: "${word}".
Devuelve un objeto JSON estricto con estas claves exactas:
{
  "word_en": "${word}",
  "word_es": "Traducción natural al español (obligatorio)",
  "real_life_context": "Explicación clara de cómo se usa.",
  "power_phrase_en": "Frase corta en inglés con esta palabra.",
  "power_phrase_es": "Traducción de la frase.",
  "pronunciation_tip": "Tip de voz."
}
Responde únicamente con el JSON.
`;
    const raw = await this.callGeminiRaw(prompt);
    try {
      const clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
      const start = clean.indexOf('{');
      const end = clean.lastIndexOf('}');
      const parsed = JSON.parse(clean.substring(start, end + 1));
      
      if (!parsed.word_es || parsed.word_es === "Traducción en proceso") {
        parsed.word_es = "Traducción al español de " + word;
      }

      this.saveToCache(`word_${cleanKey}`, parsed);
      return parsed;
    } catch (e) {
      return {
        word_en: word, 
        word_es: "Significado conceptual",
        real_life_context: raw.substring(0, 150),
        power_phrase_en: `I am mastering ${word} with Eihwaz.`, 
        power_phrase_es: `Estoy dominando ${word} con Eihwaz.`,
        pronunciation_tip: "Articula con claridad."
      };
    }
  }

  async analyzeSongBridge(title, artist) {
    this.validateInput(title, 65);

    const prompt = `
Eres Eihwaz 🦬, mentor musical de inglés experto y buscador inteligente.
El usuario buscó: "${title}" (Artista preliminar: "${artist}").

INSTRUCCIONES:
1. Si el usuario escribió con errores ortográficos el nombre de la canción o del artista, CORRÍGELO al título y artista oficial real más cercano.
2. Si la búsqueda no corresponde a ninguna canción o artista real, pon EXISTE: NO. De lo contrario, pon EXISTE: SI.
3. Resume el tema central y el significado emocional de la canción.
4. Crea una frase corta de entrenamiento en inglés (1 sola línea) inspirada en el tema o vocabulario central de esa canción para practicar pronunciación.

Responde ESTRICTAMENTE con este formato de etiquetas en texto plano (sin bloques markdown ni JSON):

EXISTE: SI
TITULO_CORREGIDO: [Nombre oficial corregido de la canción]
ARTISTA_CORREGIDO: [Nombre oficial corregido del artista]
INSIGHT: [Resumen del significado, historia y emoción de la canción]
EXPLICACION: [Qué vocabulario o estructura en inglés destaca en el tema de esta obra]
FRASE_EN: [Frase corta de 1 línea en inglés inspirada en el mensaje de la canción]
FRASE_ES: [Traducción al español de esa frase]
TIP: [Consejo práctico de pronunciación y fluidez]
`;

    const raw = await this.callGeminiRaw(prompt);

    try {
      const lines = raw.split('\n');
      let data = {
        exists: true,
        song_title: title,
        artist: artist,
        is_spanish: false,
        chorus_start_sec: 45,
        tutor_insight: `Una obra excepcional para conectar con el sentido y la temática de ${title}.`,
        bridge_explanation: "Presta atención a la unión de las palabras al practicar en voz alta.",
        power_phrase_en: "",
        power_phrase_es: "",
        pronunciation_tip: "Mantén el ritmo natural y articula con claridad."
      };

      for (let line of lines) {
        const cleanLine = line.trim();
        if (cleanLine.startsWith("EXISTE:")) {
          const val = cleanLine.replace("EXISTE:", "").trim().toUpperCase();
          if (val.includes("NO")) data.exists = false;
        }
        if (cleanLine.startsWith("TITULO_CORREGIDO:")) data.song_title = cleanLine.replace("TITULO_CORREGIDO:", "").trim().replace(/[\[\]"]/g, '') || title;
        if (cleanLine.startsWith("ARTISTA_CORREGIDO:")) data.artist = cleanLine.replace("ARTISTA_CORREGIDO:", "").trim().replace(/[\[\]"]/g, '') || artist;
        if (cleanLine.startsWith("INSIGHT:")) data.tutor_insight = cleanLine.replace("INSIGHT:", "").trim();
        if (cleanLine.startsWith("EXPLICACION:")) data.bridge_explanation = cleanLine.replace("EXPLICACION:", "").trim();
        if (cleanLine.startsWith("FRASE_EN:")) data.power_phrase_en = cleanLine.replace("FRASE_EN:", "").trim().replace(/[\[\]"]/g, '');
        if (cleanLine.startsWith("FRASE_ES:")) data.power_phrase_es = cleanLine.replace("FRASE_ES:", "").trim().replace(/[\[\]"]/g, '');
        if (cleanLine.startsWith("TIP:")) data.pronunciation_tip = cleanLine.replace("TIP:", "").trim();
      }

      if (!data.power_phrase_en || data.power_phrase_en.length < 3) {
        data.power_phrase_en = `Expressing the message of ${data.song_title} with confidence.`;
        data.power_phrase_es = `Expresando el mensaje de ${data.song_title} con confianza.`;
      }

      return data;
    } catch (e) {
      return {
        exists: true,
        song_title: title,
        artist: artist,
        is_spanish: false,
        chorus_start_sec: 45,
        tutor_insight: `Una gran elección para conectar con el sentido de ${title}.`,
        bridge_explanation: "Presta atención a la conexión de cada palabra al hablar.",
        power_phrase_en: `I am mastering English through ${title}.`, 
        power_phrase_es: `Estoy dominando el inglés a través de ${title}.`,
        pronunciation_tip: "Mantén una respiración constante y proyecta la voz."
      };
    }
  }

  async askCustomQuestion(contextTopic, userQuestion) {
    this.validateInput(userQuestion, 180);

    const prompt = `
You are Eihwaz 🦬, an elite, highly intelligent, and deeply analytical English language mentor. 
Current study context: ${contextTopic}.
Student's question: "${userQuestion}".

STRICT INSTRUCTIONS FOR YOU:
- Maintain your high-level reasoning and analytical depth, but **immerse the user in English**.
- Write your main explanation and examples primarily in natural, clear English, using Spanish sparingly and only when necessary for brief conceptual clarifications.
- Break down idioms, grammar, or phrases contextually. Give real-life usage scenarios entirely in English.
- End your response with a short, engaging follow-up question in English to keep the student practicing and thinking in the language.
- Keep it concise (max 4 or 5 lines), professional, inspiring, and rich in value. Use motivational emojis (🦬, 🔥, ✨).

Respond directly in conversational plain text (no JSON).
`;

    const rawReply = await this.callGeminiRaw(prompt);
    return rawReply.trim() || "Great question! Keep practicing this structure out loud and you will master it. 🦬🔥";
  }
}

window.aiTutor = new AITutor();