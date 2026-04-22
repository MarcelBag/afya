import { showNotification } from './notifications.js';
import { authHeaders, hasAppAuth } from './auth_fetch.js?v=4';

document.addEventListener('DOMContentLoaded', () => {
    const titlesTextarea = document.getElementById('blog-titles');
    const generateBtn = document.getElementById('generate-btn');
    const gallery = document.getElementById('results-gallery');
    const loader = document.getElementById('loader');
    const historyList = document.getElementById('history-list');
    const refreshHistoryBtn = document.getElementById('refresh-history');

    const generatorForm = document.getElementById('generator-form');
    if (!generatorForm) return;

    // Load history on initialization
    loadHistory();

    if (refreshHistoryBtn) {
        refreshHistoryBtn.addEventListener('click', loadHistory);
    }

    generatorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = titlesTextarea.value.trim();
        if (!text) {
            showNotification('Please enter at least one blog title.', 'warning');
            return;
        }

        const titles = text.split('\n').map(t => t.trim()).filter(t => t.length > 0);
        if (titles.length === 0) return;

        // Reset UI
        gallery.innerHTML = '';
        loader.classList.remove('hidden');
        generateBtn.disabled = true;

        const progressInterval = startProgress();

        try {
            if (!hasAppAuth()) {
                showNotification('Please sign in to use AI tools.', 'warning');
                window.location.href = '/signin';
                return;
            }

            const response = await fetch('/api/generate-headers', {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ titles })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Failed to generate headers');
            }

            stopProgress(progressInterval);
            renderGallery(data.results);
            loadHistory(); 
        } catch (error) {
            stopProgress(progressInterval, true);
            console.error('Error generating headers:', error);
            showNotification('An error occurred: ' + error.message, 'error');
        } finally {
            setTimeout(() => {
                loader.classList.add('hidden');
                generateBtn.disabled = false;
            }, 1000); // Small delay to show 100%
        }
    });

    function startProgress() {
        const bar = document.getElementById('progress-bar');
        const percent = document.getElementById('progress-percent');
        let width = 0;
        
        bar.style.width = '0%';
        percent.textContent = '0%';
        
        return setInterval(() => {
            if (width < 30) {
                width += 5; // Fast start
            } else if (width < 70) {
                width += 1.5; // Slow mid
            } else if (width < 95) {
                width += 0.5; // Very slow end
            }
            bar.style.width = width + '%';
            percent.textContent = Math.round(width) + '%';
        }, 500);
    }

    function stopProgress(interval, error = false) {
        clearInterval(interval);
        const bar = document.getElementById('progress-bar');
        const percent = document.getElementById('progress-percent');
        
        if (error) {
            bar.style.background = '#e53e3e';
            percent.textContent = 'Error';
        } else {
            bar.style.width = '100%';
            percent.textContent = '100%';
        }
    }

    async function loadHistory() {
        try {
            if (!hasAppAuth()) return;

            const res = await fetch('/api/header-history', {
                headers: authHeaders()
            });
            const data = await res.json();

            if (res.ok) {
                renderHistory(data);
            }
        } catch (error) {
            console.error('Error loading history:', error);
        }
    }

    function renderHistory(history) {
        if (!historyList) return;
        
        if (!history || history.length === 0) {
            historyList.innerHTML = '<p class="empty-state">No history yet.</p>';
            return;
        }

        historyList.innerHTML = history.map(item => `
            <div class="history-item">
                <div class="history-item-content" onclick="window.scrollToTool('${item.imageUrl}', '${item.title.replace(/'/g, "\\'")}')">
                    <h4>${item.title}</h4>
                    <div class="meta">${new Date(item.createdAt).toLocaleDateString()}</div>
                </div>
                <div class="history-item-actions">
                    <button class="delete-history-btn" onclick="deleteHistoryItem('${item._id}', event)" title="Delete History Item">
                        &times;
                    </button>
                </div>
            </div>
        `).join('');
    }

    window.deleteHistoryItem = async (id, event) => {
        if (event) event.stopPropagation();
        
        if (!confirm('Are you sure you want to delete this history item?')) return;

        try {
            const res = await fetch(`/api/header-history/${id}`, {
                method: 'DELETE',
                headers: authHeaders()
            });

            if (res.ok) {
                loadHistory(); // Refresh the list
            } else {
                const data = await res.json();
                showNotification('Failed to delete: ' + data.message, 'error');
            }
        } catch (error) {
            console.error('Error deleting history item:', error);
            showNotification('An error occurred during deletion.', 'error');
        }
    };

    // Helper to scroll/show a history item in the main gallery
    window.scrollToTool = (imageUrl, title) => {
        renderGallery([{ image: imageUrl, title: title }]);
        gallery.scrollIntoView({ behavior: 'smooth' });
    };

    function renderGallery(results) {
        if (!results || results.length === 0) {
            gallery.innerHTML = '<p>No results returned.</p>';
            return;
        }

        results.forEach(result => {
            const card = document.createElement('div');
            card.className = 'gallery-card';
            
            if (result.error) {
                card.innerHTML = `
                    <div style="padding: 2rem; color: #e53e3e; text-align: center;">
                        <p>Error generating image for:</p>
                        <p><strong>${result.title}</strong></p>
                        <small>${result.error}</small>
                    </div>
                `;
            } else {
                card.innerHTML = `
                    <button class="download-btn" title="Download Header" onclick="downloadImage('${result.image}', '${result.title.replace(/'/g, "\\'")}')">
                        📥
                    </button>
                    <img src="${result.image}" alt="${result.title}" loading="lazy">
                    <div class="gallery-card-content">
                        <h4>${result.title}</h4>
                    </div>
                `;
            }
            
            gallery.appendChild(card);
        });
    }

    window.downloadImage = async (url, filename) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `${filename.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error('Download failed:', error);
            showNotification('Failed to download image.', 'error');
        }
    };
});
