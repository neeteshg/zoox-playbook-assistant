import { marked } from 'marked';

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

// ============================================
// State
// ============================================
const state = {
  selectedTags: [],
  availableTags: [],
  currentQuery: '',
  currentAnswer: '',
  currentSources: [],
  feedbackGiven: false,
};

// ============================================
// API Helpers
// ============================================
const API = {
  async get(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API error: ${res.statusText}`);
    return res.json();
  },

  async post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async uploadFile(file, tags) {
    const formData = new FormData();
    formData.append('file', file);
    if (tags.length > 0) {
      formData.append('tags', JSON.stringify(tags));
    }
    const res = await fetch('/api/documents/upload', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async deleteDoc(docId) {
    const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete document');
    return res.json();
  },
};

// ============================================
// DOM Elements
// ============================================
const $ = (id) => document.getElementById(id);

const els = {
  // Tabs
  tabQuery: $('tabQuery'),
  tabKnowledge: $('tabKnowledge'),
  tabFeedback: $('tabFeedback'),
  querySection: $('querySection'),
  knowledgeSection: $('knowledgeSection'),
  feedbackSection: $('feedbackSection'),

  // Query
  queryInput: $('queryInput'),
  queryBtn: $('queryBtn'),
  tagPills: $('tagPills'),
  answerCard: $('answerCard'),
  answerModel: $('answerModel'),
  answerContent: $('answerContent'),
  sourcesList: $('sourcesList'),
  loadingCard: $('loadingCard'),

  // Feedback
  btnHelpful: $('btnHelpful'),
  btnNotHelpful: $('btnNotHelpful'),
  feedbackComment: $('feedbackComment'),
  feedbackInput: $('feedbackInput'),
  submitFeedback: $('submitFeedback'),
  feedbackThanks: $('feedbackThanks'),
  feedbackControls: $('feedbackControls'),

  // Upload
  dropZone: $('dropZone'),
  fileInput: $('fileInput'),
  uploadTags: $('uploadTags'),
  uploadProgress: $('uploadProgress'),
  progressFill: $('progressFill'),
  progressText: $('progressText'),

  // Documents
  docsBody: $('docsBody'),
  docsEmpty: $('docsEmpty'),
  docsTable: $('docsTable'),
  refreshDocs: $('refreshDocs'),

  // Feedback log
  feedbackList: $('feedbackList'),
  feedbackEmpty: $('feedbackEmpty'),
};

// ============================================
// Tab Navigation
// ============================================
function switchTab(tabName) {
  // Update nav buttons
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(section => {
    section.classList.remove('active');
  });

  const targetSection = {
    query: els.querySection,
    knowledge: els.knowledgeSection,
    feedback: els.feedbackSection,
  }[tabName];

  if (targetSection) {
    targetSection.classList.add('active');
  }

  // Load data for the tab
  if (tabName === 'knowledge') loadDocuments();
  if (tabName === 'feedback') loadFeedbackLog();
}

document.querySelectorAll('.nav-tab').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ============================================
// Tags
// ============================================
async function loadTags() {
  try {
    state.availableTags = await API.get('/api/query/tags');
    renderTags();
  } catch (err) {
    console.error('Failed to load tags:', err);
  }
}

function renderTags() {
  els.tagPills.innerHTML = state.availableTags.map(tag => `
    <button class="tag-pill ${state.selectedTags.includes(tag) ? 'selected' : ''}" data-tag="${tag}">
      ${tag}
    </button>
  `).join('');

  els.tagPills.querySelectorAll('.tag-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const tag = pill.dataset.tag;
      if (state.selectedTags.includes(tag)) {
        state.selectedTags = state.selectedTags.filter(t => t !== tag);
      } else {
        state.selectedTags.push(tag);
      }
      renderTags();
    });
  });
}

// ============================================
// Query & Answer
// ============================================
async function submitQuery() {
  const query = els.queryInput.value.trim();
  if (!query) return;

  state.currentQuery = query;
  state.feedbackGiven = false;

  // Show loading
  els.answerCard.classList.add('hidden');
  els.loadingCard.classList.remove('hidden');
  els.queryBtn.disabled = true;

  try {
    const result = await API.post('/api/query', {
      query,
      tags: state.selectedTags,
    });

    state.currentAnswer = result.answer;
    state.currentSources = result.sources;

    // Render answer
    els.answerContent.innerHTML = marked.parse(result.answer);
    els.answerModel.textContent = result.model || '';

    // Render sources
    renderSources(result.sources);

    // Reset feedback
    resetFeedbackUI();

    // Show answer card
    els.loadingCard.classList.add('hidden');
    els.answerCard.classList.remove('hidden');

    // Smooth scroll to answer
    els.answerCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    console.error('Query failed:', err);
    els.loadingCard.classList.add('hidden');
    els.answerContent.innerHTML = `<p style="color: var(--red);">Error: ${err.message}</p>`;
    els.answerCard.classList.remove('hidden');
  } finally {
    els.queryBtn.disabled = false;
  }
}

function renderSources(sources) {
  if (!sources || sources.length === 0) {
    els.sourcesList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.82rem;">No sources retrieved.</p>';
    return;
  }

  els.sourcesList.innerHTML = sources.map((s, i) => `
    <div class="source-item" data-index="${i}">
      <div class="source-item-header">
        <span class="source-doc-title">${escapeHtml(s.doc_title)}</span>
        <span class="source-score">Score: ${s.score}</span>
      </div>
      <div class="source-section-title">${escapeHtml(s.section_title)}</div>
      <div class="source-preview">${escapeHtml(s.section_text)}</div>
      <div class="source-tags">
        ${(s.tags || []).map(t => `<span class="source-tag">${escapeHtml(t)}</span>`).join('')}
      </div>
    </div>
  `).join('');

  // Toggle expand on click
  els.sourcesList.querySelectorAll('.source-item').forEach(item => {
    item.addEventListener('click', () => {
      item.classList.toggle('expanded');
    });
  });
}

// Handle query submission
els.queryBtn.addEventListener('click', submitQuery);
els.queryInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitQuery();
  }
});

// ============================================
// Feedback
// ============================================
function resetFeedbackUI() {
  els.btnHelpful.classList.remove('active');
  els.btnNotHelpful.classList.remove('active');
  els.feedbackComment.classList.add('hidden');
  els.feedbackThanks.classList.add('hidden');
  els.feedbackInput.value = '';
  state.feedbackGiven = false;
}

async function submitFeedback(rating) {
  if (state.feedbackGiven) return;

  const isHelpful = rating === 'helpful';
  els.btnHelpful.classList.toggle('active', isHelpful);
  els.btnNotHelpful.classList.toggle('active', !isHelpful);

  // Show comment box for "not helpful"
  if (!isHelpful) {
    els.feedbackComment.classList.remove('hidden');
    return; // Wait for comment submission
  }

  // For "helpful", submit immediately
  await doSubmitFeedback(rating, '');
}

async function doSubmitFeedback(rating, comment) {
  try {
    await API.post('/api/feedback', {
      query: state.currentQuery,
      answer: state.currentAnswer,
      sources: state.currentSources,
      rating,
      comment,
    });

    state.feedbackGiven = true;
    els.feedbackComment.classList.add('hidden');
    els.feedbackThanks.classList.remove('hidden');
  } catch (err) {
    console.error('Feedback submission failed:', err);
  }
}

els.btnHelpful.addEventListener('click', () => submitFeedback('helpful'));
els.btnNotHelpful.addEventListener('click', () => submitFeedback('not_helpful'));
els.submitFeedback.addEventListener('click', () => {
  doSubmitFeedback('not_helpful', els.feedbackInput.value.trim());
});

// ============================================
// File Upload
// ============================================
function setupUpload() {
  const dropZone = els.dropZone;

  // Drag events
  ['dragenter', 'dragover'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFiles(files);
  });

  els.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFiles(e.target.files);
  });
}

async function handleFiles(fileList) {
  const files = Array.from(fileList);
  const tagsStr = els.uploadTags.value.trim();
  const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(t => t) : [];

  els.uploadProgress.classList.remove('hidden');

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    els.progressText.textContent = `Uploading ${file.name} (${i + 1}/${files.length})...`;
    els.progressFill.style.width = `${((i) / files.length) * 100}%`;

    try {
      const result = await API.uploadFile(file, tags);
      els.progressText.textContent = `✅ ${file.name}: ${result.sections_count} sections extracted`;
      els.progressFill.style.width = `${((i + 1) / files.length) * 100}%`;
    } catch (err) {
      els.progressText.textContent = `❌ ${file.name}: ${err.message}`;
    }
  }

  // Finish
  els.progressFill.style.width = '100%';
  setTimeout(() => {
    els.progressText.textContent = `Upload complete! ${files.length} file(s) processed.`;
    loadTags(); // Refresh tags
    loadDocuments(); // Refresh table
  }, 500);

  setTimeout(() => {
    els.uploadProgress.classList.add('hidden');
    els.progressFill.style.width = '0%';
    els.fileInput.value = '';
    els.uploadTags.value = '';
  }, 4000);
}

// ============================================
// Documents Table
// ============================================
async function loadDocuments() {
  try {
    const docs = await API.get('/api/documents');

    if (docs.length === 0) {
      els.docsBody.innerHTML = '';
      els.docsEmpty.classList.remove('hidden');
      els.docsTable.classList.add('hidden');
      return;
    }

    els.docsEmpty.classList.add('hidden');
    els.docsTable.classList.remove('hidden');

    els.docsBody.innerHTML = docs.map(d => `
      <tr>
        <td class="doc-title-cell">${escapeHtml(d.doc_title)}</td>
        <td><span class="doc-source-badge">${escapeHtml(d.source_type)}</span></td>
        <td><span class="doc-section-count">${d.section_count}</span></td>
        <td>
          <div class="doc-tags">
            ${(d.all_tags || []).map(t => `<span class="doc-tag">${escapeHtml(t)}</span>`).join('')}
          </div>
        </td>
        <td class="doc-date">${formatDate(d.last_updated)}</td>
        <td>
          <button class="btn btn-small btn-danger" onclick="deleteDocument('${escapeHtml(d.doc_id)}')">Delete</button>
        </td>
      </tr>
    `).join('');

  } catch (err) {
    console.error('Failed to load documents:', err);
  }
}

// Make deleteDocument available globally
window.deleteDocument = async function(docId) {
  if (!confirm('Are you sure you want to delete this document and all its sections?')) return;
  try {
    await API.deleteDoc(docId);
    loadDocuments();
    loadTags();
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
};

els.refreshDocs.addEventListener('click', loadDocuments);

// ============================================
// Feedback Log
// ============================================
async function loadFeedbackLog() {
  try {
    const feedback = await API.get('/api/feedback');

    if (feedback.length === 0) {
      els.feedbackList.innerHTML = '';
      els.feedbackEmpty.classList.remove('hidden');
      return;
    }

    els.feedbackEmpty.classList.add('hidden');
    els.feedbackList.innerHTML = feedback.map(f => `
      <div class="feedback-entry">
        <div class="feedback-entry-header">
          <span class="feedback-query">"${escapeHtml(truncate(f.query, 80))}"</span>
          <span class="feedback-rating-badge ${f.rating === 'helpful' ? 'helpful' : 'not-helpful'}">
            ${f.rating === 'helpful' ? '👍 Helpful' : '👎 Not Helpful'}
          </span>
        </div>
        ${f.comment ? `<div class="feedback-entry-comment">"${escapeHtml(f.comment)}"</div>` : ''}
        <div class="feedback-entry-time">${formatDate(f.timestamp)}</div>
      </div>
    `).join('');

  } catch (err) {
    console.error('Failed to load feedback:', err);
  }
}

// ============================================
// Utilities
// ============================================
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '...' : str;
}

// ============================================
// Initialize
// ============================================
async function init() {
  setupUpload();
  await loadTags();
  await loadDocuments();

  // Check API health
  try {
    const health = await API.get('/api/health');
    const badge = $('statusBadge');
    if (health.hasApiKey) {
      badge.querySelector('.status-text').textContent = 'AI Powered';
    } else {
      badge.querySelector('.status-text').textContent = 'Keyword Mode';
      badge.querySelector('.status-dot').style.background = 'var(--accent)';
      badge.style.background = 'var(--accent-soft)';
      badge.style.borderColor = 'rgba(245, 158, 11, 0.2)';
      badge.querySelector('.status-text').style.color = 'var(--accent)';
    }
  } catch {
    const badge = $('statusBadge');
    badge.querySelector('.status-text').textContent = 'Server Offline';
    badge.querySelector('.status-dot').style.background = 'var(--red)';
    badge.style.background = 'var(--red-soft)';
    badge.style.borderColor = 'rgba(239, 68, 68, 0.2)';
    badge.querySelector('.status-text').style.color = 'var(--red)';
  }
}

init();
