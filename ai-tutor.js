/**
 * Eihwaz Tutor Service (Con Diccionario Semilla, Caché Inteligente, Escudo Anti-Spam y Chat Interactivo)
 */

const CLOUDFLARE_WORKER_URL = "https://eihwaz-mentor.alexandergrf2003.workers.dev";

const AI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest'
];

// RESPUESTAS PRE-CARGADAS (Gastan 0 peticiones cuando los usuarios tocan los botones de ejemplo)
const PRESET_WORDS = {
  "unstoppable": {
    "word_en": "Unstoppable",
    "word_es": "Imparable",
    "real_life_context": "Se usa cuando tienes tanta determinación y enfoque en tu meta que ningún obstáculo puede frenarte.",
    "power_phrase_en": "With discipline and faith, I am unstoppable today.",
    "power_phrase_es": "Con disciplina y fe, hoy soy imparable.",
    "pronunciation_tip": "Empieza con un sonido corto 'an-' (no 'un-'), marca fuerte '-STOP-' y termina suave en '-a-bol'."
  },
  "lean on me": {
    "word_en": "Lean on me",
    "word_es": "Apóyate en mí / Cuenta conmigo",
    "real_life_context": "Frase de lealtad total para decirle a un amigo o familiar que puede confiar en ti cuando las cosas se ponen difíciles.",
    "power_phrase_en": "When times get tough, you can always lean on me.",
    "power_phrase_es": "Cuando los tiempos se pongan difíciles, siempre puedes apoyarte en mí.",
    "pronunciation_tip": "Une la 'n' de 'lean' con la 'o' de 'on' para que suene fluido como 'lín-on-mi'."
  },
  "relentless": {
    "word_en": "Relentless",
    "word_es": "Implacable / Incansable",
    "real_life_context": "Describe a alguien que insiste una y otra vez sin rendirse jamás hasta dominar una habilidad.",
    "power_phrase_en": "Stay relentless in pursuit of your dreams.",
    "power_phrase_es": "Mantente incansable en la búsqueda de tus sueños.",
    "pronunciation_tip": "Suena 'ri-LENT-les'. Dale fuerza a la sílaba del medio y suelta el final suave."
  },
  "grace": {
    "word_en": "Grace",
    "word_es": "Gracia / Paz inmerecida",
    "real_life_context": "Se usa tanto para hablar de favor espiritual y perdón como para describir elegancia y calma bajo presión.",
    "power_phrase_en": "Grace gives me the strength to start again.",
    "power_phrase_es": "La gracia me da la fuerza para empezar de nuevo.",
    "pronunciation_tip": "Pronúncialo como 'greis', abriendo ligeramente la sonrisa en la 'ei' y cerrando con una 's' limpia."
  }
};

class AITutor {
  constructor() {
    this.storageKey = 'eihwaz_gemini_api_key';
    this.cacheKey = 'eihwaz_smart_cache_v2';
    this.lastRequestTime = 0;
  }

  getApiKey() { return localStorage.getItem(this.storageKey) || ''; }
  setApiKey(key) { localStorage.setItem(this.storageKey, key.trim()); }
  hasKey() { return !!this.getApiKey(); }
  hasProxy() { return CLOUDFLARE_WORKER_URL.trim().length > 0; }
  isReady() { return this.hasProxy() || this.hasKey(); }

  getFromCache(key) {
    try {
      const cache = JSON.parse(localStorage.getItem(this.cacheKey) || '{}');
      return cache[key.toLowerCase().trim()] || null;
    } catch (e) { return null; }
  }

  saveToCache(key, data) {
    try {
      const cache = JSON.parse(localStorage.getItem(this.cacheKey) || '{}');
      cache[key.toLowerCase().trim()] = data;
      localStorage.setItem(this.cacheKey, JSON.stringify(cache));
    } catch (err) {}
  }

  validateInput(text, maxLen = 65) {
    const clean = text.trim();
    if (clean.length < 2) {
      throw new Error('Escribe al menos 2 letras para que Eihwaz pueda analizarlo.');
    }
    if (clean.length > maxLen) {
      throw new Error(`Texto muy largo (máximo ${maxLen} caracteres).`);
    }
    // Bloquea teclado loco, risas repetidas o símbolos sin letras
    if (!/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(clean) || /^(?:[bcdfghjklmnpqrstvwxyz]{6,}|(?:ja|je|ji|ha|he){3,}|(.)\1{4,})$/i.test(clean)) {
      throw new Error('Eihwaz detectó texto sin sentido. ¡Prueba con una palabra o pregunta real!');
    }
    const now = Date.now();
    if (now - this.lastRequestTime < 2000) {
      throw new Error('¡Vas muy rápido! Espera 2 segundos antes de la siguiente consulta.');
    }
    this.lastRequestTime = now;
  }

  async callGeminiWithFallback(prompt) {
    if (this.hasProxy()) {
      const response = await fetch(CLOUDFLARE_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      if (!response.ok) {
        const errInfo = await response.json().catch(() => ({}));
        throw new Error(errInfo.error || `Servidor Eihwaz ocupado (${response.status})`);
      }
      return await response.json();
    }

    const key = this.getApiKey();
    if (!key) throw new Error('NO_API_KEY');

    let lastError = null;
    for (const model of AI_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { response_mime_type: 'application/json', temperature: 0.7 }
          })
        });

        if (response.ok) {
          const data = await response.json();
          let textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (textContent) {
            textContent = textContent.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(textContent);
          }
        }
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('No se pudo conectar.');
  }

  async exploreWord(word) {
    const cleanKey = word.toLowerCase().trim();

    // 1. Revisa si es uno de los botones rápidos pre-cargados (0 gasto de red)
    if (PRESET_WORDS[cleanKey]) {
      return PRESET_WORDS[cleanKey];
    }

    // 2. Revisa si ya está en la memoria caché del teléfono
    const cacheId = `word_${cleanKey}`;
    const cached = this.getFromCache(cacheId);
    if (cached) return cached;

    // 3. Valida anti-spam antes de llamar a Cloudflare
    this.validateInput(word, 65);

    const prompt = `
Eres Eihwaz, el mentor de inglés cercano, apasionado, sabio y directo. Analiza "${word}".
Si el usuario escribió algo ofensivo o bromas pesadas, redirígelo con sabiduría a una palabra de disciplina en inglés.
Responde en formato JSON válido con estas claves exactas:
{
  "word_en": "${word}",
  "word_es": "Traducción natural al español",
  "real_life_context": "Explicación directa de 2 líneas sobre cómo se usa en la vida real. Cero clichés.",
  "power_phrase_en": "Una frase corta y poderosa en inglés para entrenar la voz.",
  "power_phrase_es": "Traducción al español de la frase.",
  "pronunciation_tip": "Tip físico concreto para pronunciarla bien."
}`;
    const result = await this.callGeminiWithFallback(prompt);
    this.saveToCache(cacheId, result);
    return result;
  }

  async analyzeSongBridge(title, artist) {
    const cleanKey = `song_${title}_${artist}`.toLowerCase().trim();
    const cached = this.getFromCache(cleanKey);
    if (cached) return cached;

    this.validateInput(title, 65);

    const prompt = `
Eres Eihwaz, el mentor musical de inglés. Analiza la canción "${title}" de "${artist}".
Detecta si está en español o inglés y responde en formato JSON válido con estas claves exactas:
{
  "song_title": "${title}",
  "artist": "${artist}",
  "is_spanish": true,
  "chorus_start_sec": 45,
  "tutor_insight": "Comentario cercano en primera persona como Eihwaz sobre el sentimiento de esta canción.",
  "bridge_explanation": "Cómo llevar esa idea al inglés natural (si es en español) o el secreto del verso clave (si es en inglés).",
  "power_phrase_en": "El verso en inglés más potente para cantar y practicar.",
  "power_phrase_es": "Significado en español de ese verso.",
  "pronunciation_tip": "Consejo práctico de pronunciación o fluidez al cantarla."
}`;
    const result = await this.callGeminiWithFallback(prompt);
    this.saveToCache(cleanKey, result);
    return result;
  }

  // NUEVO: MOTOR DE CHAT INTERACTIVO ESTRICTO EN INGLÉS
  async askCustomQuestion(contextTopic, userQuestion) {
    this.validateInput(userQuestion, 180);

  const prompt = `
Eres Eihwaz 🦬, un mentor de inglés de élite, apasionado, sumamente motivador, adictivo y profesional.
Contexto actual de estudio: ${contextTopic}.
Pregunta del estudiante: "${userQuestion}".
REGLA ESTRICTA: Tu ÚNICA misión es enseñar inglés (vocabulario, pronunciación, gramática práctica y frases de poder). Si el usuario pregunta sobre temas ajenos al inglés, niégate con carisma y redirígelo de inmediato.
REGLA DE TRATO UNIVERSAL: No asumas género ni uses palabras masculinizadas como "campeón", "hermano" o "amigo". Usa siempre un tono neutro y universal que sirva igual para mujeres y hombres (ejemplos: "¡Vamos con todo!", "¡Excelente!", "¡Esa es la actitud!", "¡A dominarlo!").
Responde en máximo 3 líneas llenas de energía, claridad y ejemplos reales.
Responde SIEMPRE en formato JSON válido exactamente con esta estructura:
{
  "reply": "Tu respuesta motivadora y clara aquí con emojis (🦬, 🔥, ✨)"
}`;

    const result = await this.callGeminiWithFallback(prompt);
    return result.reply || result.text_reply || "¡Sigue practicando esta estructura en voz alta! 🦬🔥";
  }
}

window.aiTutor = new AITutor();