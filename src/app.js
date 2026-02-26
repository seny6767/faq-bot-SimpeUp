import { FAQ } from './faq.js';

const STORAGE_KEY = 'faqChatHistory';
const MAX_SIMILAR = 5;
const SCORE_QUESTION_EXACT = 2;
const SCORE_QUESTION_FUZZY = 1;
const SCORE_TAG_EXACT = 1;
const MIN_SCORE = 1.2;
const MIN_WORD_LENGTH = 3;
const MIN_LENGTH_FOR_FUZZY = 5;
const MAX_FUZZY_DIST = 2;

const chatMessagesEl = document.getElementById('chatMessages');
const questionInput = document.getElementById('questionInput');
const sendButton = document.getElementById('sendButton');
const clearButton = document.getElementById('clearButton');
const similarListEl = document.getElementById('similarList');
const quickButtonsEl = document.getElementById('quickButtons');
const infoSection = document.getElementById('infoSection');
const modalOverlay = document.getElementById('modalOverlay');
const modalYes = document.getElementById('modalYes');
const modalNo = document.getElementById('modalNo');

let messages = [];
let similarQuestions = [];
let lastQuery = '';
let typingIndicator = null;
let isProcessing = false;

const wordFrequency = {};

const normalizeText = str => str.toLowerCase().replace(/[^\w\sа-яё]/gi, '').trim();
const getWords = str => normalizeText(str).split(/\s+/).filter(w => w.length >= MIN_WORD_LENGTH);

FAQ.forEach(item => {
  getWords(item.q).forEach(w => wordFrequency[w] = (wordFrequency[w] || 0) + 1);
  if (item.tags) item.tags.forEach(tag => {
    const normTag = normalizeText(tag);
    if (normTag.length >= MIN_WORD_LENGTH) wordFrequency[normTag] = (wordFrequency[normTag] || 0) + 1;
  });
});

const levenshtein = (a, b) => {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix = Array(b.length + 1).fill().map((_, i) => [i]);
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
};

const searchFAQ = query => {
  const queryWords = getWords(query);
  if (!queryWords.length) return [];
  return FAQ.map(item => {
    let score = 0;
    const questionWords = getWords(item.q);
    const tags = item.tags ? item.tags.map(t => normalizeText(t)).filter(t => t.length >= MIN_WORD_LENGTH) : [];
    queryWords.forEach(qw => {
      const freq = wordFrequency[qw] || 0;
      const weight = 1 / (freq + 1);
      const exactInQuestion = questionWords.some(qWord => qWord === qw);
      if (exactInQuestion) score += SCORE_QUESTION_EXACT * weight;
      if (qw.length >= MIN_LENGTH_FOR_FUZZY && !exactInQuestion) {
        questionWords.forEach(qWord => {
          if (levenshtein(qWord, qw) <= MAX_FUZZY_DIST) score += SCORE_QUESTION_FUZZY * weight;
        });
      }
      if (tags.some(tag => tag === qw)) score += SCORE_TAG_EXACT * weight;
    });
    return { item, score };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);
};

const getAnswer = query => {
  const results = searchFAQ(query);
  let answer = null;
  let similar = [];
  if (results.length) {
    const best = results[0];
    if (best.score >= MIN_SCORE) answer = best.item.a;
    similar = results.slice(0, MAX_SIMILAR).map(r => r.item.q);
  }
  return {
    answer: answer || 'Нет точно ответа. Возможно, вам помогут вопросы из правой колонки.',
    similar
  };
};

const highlightMatches = (text, query) => {
  if (!query) return text;
  const words = getWords(query);
  if (!words.length) return text;
  let result = text;
  words.forEach(word => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '<mark>$1</mark>');
  });
  return result;
};

const renderSimilar = () => {
  if (!similarListEl) return;
  if (!similarQuestions.length) {
    similarListEl.innerHTML = '<p>Нет похожих вопросов</p>';
    return;
  }
  const list = document.createElement('ul');
  similarQuestions.forEach(qText => {
    const li = document.createElement('li');
    li.className = 'similar-item';
    li.innerHTML = highlightMatches(qText, lastQuery);
    li.addEventListener('click', () => sendMessage(qText));
    list.appendChild(li);
  });
  similarListEl.innerHTML = '';
  similarListEl.appendChild(list);
};

const renderMessages = () => {
  chatMessagesEl.innerHTML = '';
  messages.forEach(msg => {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${msg.sender}`;
    msgDiv.textContent = msg.text;
    chatMessagesEl.appendChild(msgDiv);
  });
  scrollToBottom();
};

const saveHistory = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));

const loadHistory = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { messages = JSON.parse(saved); } catch { messages = []; }
  } else {
    messages = [{
      sender: 'bot',
      text: 'Привет! Я чат-бот по FAQ. Задайте мне вопрос, например: "Как узнать статус заказа?"'
    }];
  }
  renderMessages();
};

const scrollToBottom = () => chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;

const showTypingIndicator = () => {
  hideTypingIndicator();
  const indicator = document.createElement('div');
  indicator.className = 'message bot typing-indicator';
  indicator.innerHTML = '<span></span><span></span><span></span>';
  chatMessagesEl.appendChild(indicator);
  typingIndicator = indicator;
  scrollToBottom();
};

const hideTypingIndicator = () => {
  if (typingIndicator) typingIndicator.remove();
  typingIndicator = null;
};

const typeMessage = (text, element, delay = 30) => new Promise(resolve => {
  let i = 0;
  element.textContent = '';
  const interval = setInterval(() => {
    if (i < text.length) {
      element.textContent += text.charAt(i);
      i++;
      scrollToBottom();
    } else {
      clearInterval(interval);
      resolve();
    }
  }, delay);
});

const addMessage = async (text, sender, animate = false, save = true) => {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${sender}`;
  chatMessagesEl.appendChild(msgDiv);
  scrollToBottom();
  if (animate && sender === 'bot') await typeMessage(text, msgDiv, 30);
  else msgDiv.textContent = text;
  messages.push({ text, sender, timestamp: Date.now() });
  if (save) saveHistory();
};

const setInterfaceLock = locked => {
  isProcessing = locked;
  questionInput.disabled = locked;
  sendButton.disabled = locked;
  clearButton.disabled = locked;
  infoSection.classList.toggle('locked', locked);
};

const showModal = () => modalOverlay.style.display = 'flex';
const hideModal = () => modalOverlay.style.display = 'none';

const handleSend = async () => {
  const query = questionInput.value.trim();
  if (!query || isProcessing) return;
  await addMessage(query, 'user');
  setInterfaceLock(true);
  showTypingIndicator();
  await new Promise(resolve => setTimeout(resolve, 600));
  const { answer, similar } = getAnswer(query);
  hideTypingIndicator();
  await addMessage(answer, 'bot', true);
  lastQuery = query;
  similarQuestions = similar;
  renderSimilar();
  questionInput.value = '';
  setInterfaceLock(false);
};

const sendMessage = text => {
  questionInput.value = text;
  handleSend();
};

const clearHistory = () => showModal();

const initQuickButtons = () => {
  const quickList = FAQ.slice(0, 8).map(item => item.q);
  quickButtonsEl.innerHTML = '';
  quickList.forEach(q => {
    const btn = document.createElement('button');
    btn.className = 'quick-btn';
    btn.textContent = q.length > 30 ? q.substring(0, 30) + '…' : q;
    btn.title = q;
    btn.addEventListener('click', () => sendMessage(q));
    quickButtonsEl.appendChild(btn);
  });
};

modalYes.addEventListener('click', () => {
  hideModal();
  localStorage.removeItem(STORAGE_KEY);
  messages = [];
  chatMessagesEl.innerHTML = '';
  addMessage('Чат очищен.', 'bot');
  similarQuestions = [];
  renderSimilar();
  setInterfaceLock(false);
});

modalNo.addEventListener('click', hideModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) hideModal(); });

document.addEventListener('DOMContentLoaded', () => {
  loadHistory();
  initQuickButtons();
  sendButton.addEventListener('click', handleSend);
  clearButton.addEventListener('click', clearHistory);
  questionInput.addEventListener('keypress', e => { if (e.key === 'Enter') handleSend(); });
});