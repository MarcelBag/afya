import { showNotification } from './notifications.js';
import { authHeaders, hasAppAuth } from './auth_fetch.js';

const confirmModal = document.getElementById('confirm-modal');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete');
let analysisToDelete = null;

function closeDeleteModal() {
    if (confirmModal) {
        confirmModal.classList.remove('is-open');
        confirmModal.classList.add('hidden');
    }
    analysisToDelete = null;
}

function openDeleteModal() {
    if (confirmModal) {
        confirmModal.classList.remove('hidden');
        confirmModal.classList.add('is-open');
    }
}

function getCurrentUserRole() {
    const djangoRole = document.body.dataset.djangoRole;
    if (djangoRole) return djangoRole;

    const token = localStorage.getItem('token');
    if (!token) return 'user';

    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.role || 'user';
    } catch (err) {
        return 'user';
    }
}

function canDeleteHistory() {
    return ['admin', 'superuser'].includes(getCurrentUserRole());
}

async function fetchAnalysisHistory() {
    const list = document.getElementById('analysis-history-list');
    if (!list) return;

    try {
        if (!hasAppAuth()) return;
        const res = await fetch('/api/analysis-history', {
            headers: authHeaders()
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.message);

        const showDeleteActions = canDeleteHistory();

        if (data.length === 0) {
            list.innerHTML = '<p class="empty-state">No history yet.</p>';
            return;
        }

        list.innerHTML = data.map(item => `
            <div class="history-item" data-id="${item._id}">
                <img src="${item.imagePath}" alt="Analysis" class="history-thumb">
                <div class="history-info">
                    <span class="history-title">${item.prediction}</span>
                    <span class="history-date">${new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
                ${showDeleteActions ? `<button class="delete-history-btn" data-id="${item._id}" title="Delete record">×</button>` : ''}
            </div>
        `).join('');

        // Add event listeners for viewing
        list.querySelectorAll('.history-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-history-btn')) return;
                const item = data.find(i => i._id === e.currentTarget.dataset.id);
                if (item) displayAnalysisResult(item);
            });
        });

        // Add event listeners for deletion
        list.querySelectorAll('.delete-history-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                analysisToDelete = e.target.dataset.id;
                openDeleteModal();
            });
        });

    } catch (err) {
        console.error('History Error:', err);
    }
}

async function deleteAnalysis(id) {
    if (!canDeleteHistory()) {
        showNotification('Only admins can delete analysis records', 'error');
        closeDeleteModal();
        return;
    }

    try {
        const res = await fetch(`/api/analysis-history/${id}`, {
            method: 'DELETE',
            headers: authHeaders()
        });
        if (res.ok) {
            showNotification('Analysis deleted', 'success');
            closeDeleteModal();
            fetchAnalysisHistory();
        }
    } catch (err) {
        showNotification('Failed to delete', 'error');
    }
}

function displayAnalysisResult(data) {
    const resultsSection = document.getElementById('results-section');
    const resultsContainer = document.getElementById('results');
    
    resultsSection.classList.remove('hidden');
    
    const prediction = data.prediction || 'Unknown';
    const isMalignant = prediction.toLowerCase() === 'malignant';
    const isCommon = ['acne', 'eczema', 'psoriasis', 'rash', 'benign'].includes(prediction.toLowerCase());
    
    let badgeClass = 'status-notice';
    if (isMalignant) badgeClass = 'status-malignant';
    else if (isCommon) badgeClass = 'status-benign';
    
    const confidence = data.confidence || 0;
    
    resultsContainer.innerHTML = `
        <div class="hp-img-wrap" style="margin-bottom: 25px; border-radius: 12px; overflow: hidden; border: 1px solid var(--c-border);"
             onclick="window.openLightbox('${data.imagePath}', '${prediction}')">
            <img src="${data.imagePath}" alt="Analyzed Skin" style="width: 100%; height: 200px; object-fit: cover; display: block;">
        </div>
        <div class="status-badge ${badgeClass}">${prediction}</div>
        <h3 style="margin-bottom: 5px;">Analysis Result</h3>
        <p style="color: #718096; font-size: 0.9rem;">Cached analysis from ${new Date(data.createdAt).toLocaleDateString()}.</p>
        
        <div class="progress-track">
            <div class="progress-fill" style="width: ${confidence}%"></div>
        </div>
        <div class="result-meta">
            <span>Confidence: <strong>${confidence}%</strong></span>
            <span>Type: ${data.analysisType || prediction}</span>
        </div>
        
        <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid #edf2f7; font-size: 0.88rem; line-height: 1.6; color: #4a5568;">
            <p><strong>AI Assessment:</strong> ${isMalignant ? 'Potential high risk detected. Please consult a dermatologist urgently.' : (isCommon ? 'This appears to be a common skin condition or benign feature.' : 'The features are complex. Professional evaluation is recommended.')}</p>
        </div>
    `;
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', () => {
    closeDeleteModal();

    fetchAnalysisHistory();
    const refreshBtn = document.getElementById('refresh-analysis-history');
    if (refreshBtn) refreshBtn.addEventListener('click', fetchAnalysisHistory);

    // Modal listeners
    if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', () => {
            if (analysisToDelete) deleteAnalysis(analysisToDelete);
        });
    }
});

export { fetchAnalysisHistory };
