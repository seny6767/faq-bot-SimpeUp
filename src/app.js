import { FAQ } from './faq.js';

const STORAGE_KEY = 'faqChatHistory';
const MAX_SIMILAR = 5;
const SCORE_QUESTION_WEIGHT = 2;
const SCORE_TAG_WEIGHT = 1;
const MIN_SCORE = 1;

// элементы dom
const chatMessagesEl = document.getElementById('chatMessages');
const questionInput = document.getElementById('questionInput');
const sendButton = document.getElementById('sendButton');
const clearButton = document.getElementById('clearButton');
const similarListEl = document.getElementById('similarList');
const quickButtonsEl = document.getElementById('quickButtons');
const infoSection = document.getElementById('infoSection');

// модальные окна
const modalOverlay = document.getElementById('modalOverlay');
const modalYes = document.getElementById('modalYes');
const modalNo = document.getElementById('modalNo');

let messages = [];
let similarQuestions = [];
let lastQuery = '';
let typingIndicator = null;
let isProcessing = false;

function normalizeText(str) {
  return str.toLowerCase().replace(/[^\w\sа-яё]/gi, '').trim();
}

function getWords(str) {
  return normalizeText(str).split(/\s+/).filter(w => w.length > 0);
}

function searchFAQ(query) {
  const queryWords = getWords(query);
  if (queryWords.length === 0) return [];

  return FAQ.map(item => {
    let score = 0;
    const questionWords = getWords(item.q);
    const tags = item.tags ? item.tags.map(t => normalizeText(t)) : [];

    queryWords.forEach(qw => {
      if (questionWords.some(qWord => qWord === qw)) {
        score += SCORE_QUESTION_WEIGHT;
      }
      if (tags.some(tag => tag === qw)) {
        score += SCORE_TAG_WEIGHT;
      }
    });

    return { item, score };
  })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

function getAnswer(query) {
  const results = searchFAQ(query);
  let answer = null;
  let similar = [];

  if (results.length > 0) {
    const best = results[0];
    if (best.score >= MIN_SCORE) {
      answer = best.item.a;
    }
    similar = results.slice(0, MAX_SIMILAR).map(r => r.item.q);
  }

  return {
    answer: answer || 'Извините, я не нашел точного ответа. Возможно, вам помогут похожие вопросы ниже.',
    similar: similar.slice(0, MAX_SIMILAR)
  };
}

function highlightMatches(text, query) {
  if (!query) return text;
  const words = getWords(query);
  if (words.length === 0) return text;

  let result = text;
  words.forEach(word => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    result = result.replace(regex, '<mark>$1</mark>');
  });
  return result;
}

function renderSimilar() {
  if (!similarListEl) return;
  if (similarQuestions.length === 0) {
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
}

function renderMessages() {
  chatMessagesEl.innerHTML = '';
  messages.forEach(msg => {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${msg.sender}`;
    msgDiv.textContent = msg.text;
    chatMessagesEl.appendChild(msgDiv);
  });
  scrollToBottom();
}

function saveHistory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
}

function loadHistory() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      messages = JSON.parse(saved);
    } catch {
      messages = [];
    }
  } else {
    messages = [{
      sender: 'bot',
      text: 'Привет! Я чат-бот по FAQ. Задайте мне вопрос, например: "Как узнать статус заказа?"'
    }];
  }
  renderMessages();
}

function scrollToBottom() {
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function showTypingIndicator() {
  hideTypingIndicator();
  const indicator = document.createElement('div');
  indicator.className = 'message bot typing-indicator';
  indicator.innerHTML = '<span></span><span></span><span></span>';
  chatMessagesEl.appendChild(indicator);
  typingIndicator = indicator;
  scrollToBottom();
}

function hideTypingIndicator() {
  if (typingIndicator) {
    typingIndicator.remove();
    typingIndicator = null;
  }
}

function typeMessage(text, element, delay = 30) {
  return new Promise(resolve => {
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
}

function addMessage(text, sender, save = true) {
  messages.push({ text, sender, timestamp: Date.now() });
  if (save) saveHistory();
  renderMessages();
}

async function addBotMessageWithAnimation(text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message bot';
  chatMessagesEl.appendChild(msgDiv);
  scrollToBottom();

  await typeMessage(text, msgDiv, 30);

  messages.push({ text, sender: 'bot', timestamp: Date.now() });
  saveHistory();
}

function showClearConfirmModal() {
  modalOverlay.style.display = 'flex';
}

function hideModal() {
  modalOverlay.style.display = 'none';
}

function lockInterface() {
  isProcessing = true;
  questionInput.disabled = true;
  sendButton.disabled = true;
  clearButton.disabled = true;
  infoSection.classList.add('locked');
}

function unlockInterface() {
  isProcessing = false;
  questionInput.disabled = false;
  sendButton.disabled = false;
  clearButton.disabled = false;
  infoSection.classList.remove('locked');
}

async function handleSend() {
  const query = questionInput.value.trim();
  if (!query || isProcessing) return;

  lockInterface();

  addMessage(query, 'user');
  showTypingIndicator();
  await new Promise(resolve => setTimeout(resolve, 600));
  const { answer, similar } = getAnswer(query);
  hideTypingIndicator();
  await addBotMessageWithAnimation(answer);

  lastQuery = query;
  similarQuestions = similar;
  renderSimilar();
  questionInput.value = '';
  unlockInterface();
}

function sendMessage(text) {
  questionInput.value = text;
  handleSend();
}

function clearHistory() {
  showClearConfirmModal();
}

function performClear() {
  localStorage.removeItem(STORAGE_KEY);
  messages = [];
  renderMessages();
  similarQuestions = [];
  renderSimilar();
  addMessage('Чат очищен.', 'bot');
  hideModal();
}

function initQuickButtons() {
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
}

modalYes.addEventListener('click', performClear);
modalNo.addEventListener('click', hideModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) {
    hideModal();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  loadHistory();
  initQuickButtons();
  sendButton.addEventListener('click', handleSend);
  clearButton.addEventListener('click', clearHistory);
  questionInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') handleSend();
  });
});