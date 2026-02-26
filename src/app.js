import { FAQ } from './faq.js';

const STORAGE_KEY = 'faqChatHistory';
const MAX_SIMILAR = 5;
const SCORE_QUESTION_WEIGHT = 2;
const SCORE_TAG_WEIGHT = 1;
const MIN_SCORE = 1;

// DOM элементы
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

// Состояние
let messages = [];
let similarQuestions = [];
let lastQuery = '';
let typingIndicator = null;
let isProcessing = false;

// Вспомогательные функции (без изменений)
function normalizeText(str) {
  return str.toLowerCase().replace(/[^\w\sа-яё]/gi, '').trim();
}

function getWords(str) {
  return normalizeText(str).split(/\s+/).filter(w => w.length > 0);
}

// поиск ответа в fqa + валидациия ответа по тегам и проверка на вхождение подстроки
function searchFAQ(query) {
  const queryWords = getWords(query);
  if (queryWords.length === 0) return [];

  return FAQ.map(item => {
    let score = 0;
    const questionWords = getWords(item.q);
    const tags = item.tags ? item.tags.map(t => normalizeText(t)) : [];

    queryWords.forEach(qw => {
      if (questionWords.some(qWord => qWord.includes(qw) || qw.includes(qWord))) {
        score += SCORE_QUESTION_WEIGHT;
      }
      if (tags.some(tag => tag.includes(qw) || qw.includes(tag))) {
        score += SCORE_TAG_WEIGHT;
      }
    });

    return { item, score };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);
}

// получить ответ
function getAnswer(query) {
  const results = searchFAQ(query);
  let answer = null;
  let similar = [];

  if (results.length > 0) {
    const best = results[0];
    if (best.score >= MIN_SCORE) answer = best.item.a;
    similar = results.slice(0, MAX_SIMILAR).map(r => r.item.q);
  }

  return {
    answer: answer || 'Не было найдено точного ответа. Возможно, вам помогут похожие вопросы справа в колонке.',
    similar
  };
}

function highlightMatches(text, query) {
  if (!query) return text;
  const words = getWords(query);
  if (!words.length) return text;

  let result = text;
  words.forEach(word => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '<mark>$1</mark>');
  });
  return result;
}

// Отрисовка похожих вопросов
function renderSimilar() {
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
}

// Отрисовка сообщений
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

// История
function saveHistory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
}

function loadHistory() {
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
}

function scrollToBottom() {
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

// Индикатор печати
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

// Анимация печати
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

// Универсальное добавление сообщения (с анимацией для бота)
async function addMessage(text, sender, animate = false, save = true) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${sender}`;
  chatMessagesEl.appendChild(msgDiv);
  scrollToBottom();

  if (animate && sender === 'bot') {
    await typeMessage(text, msgDiv, 30);
  } else {
    msgDiv.textContent = text;
  }

  messages.push({ text, sender, timestamp: Date.now() });
  if (save) saveHistory();
}

// Блокировка интерфейса
function setInterfaceLock(locked) {
  isProcessing = locked;
  questionInput.disabled = locked;
  sendButton.disabled = locked;
  clearButton.disabled = locked;
  infoSection.classList.toggle('locked', locked);
}

// Модальное окно
function showModal() {
  modalOverlay.style.display = 'flex';
}

function hideModal() {
  modalOverlay.style.display = 'none';
}

// Отправка вопроса
async function handleSend() {
  const query = questionInput.value.trim();
  if (!query || isProcessing) return;

  setInterfaceLock(true);
  await addMessage(query, 'user');

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
}

// Отправка через быстрые кнопки / похожие вопросы
function sendMessage(text) {
  questionInput.value = text;
  handleSend();
}

// Очистка чата
function clearHistory() {
  showModal();
}

// Инициализация быстрых кнопок
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

// Обработчики модального окна
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
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) hideModal();
});

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
  loadHistory();
  initQuickButtons();
  sendButton.addEventListener('click', handleSend);
  clearButton.addEventListener('click', clearHistory);
  questionInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') handleSend();
  });
});