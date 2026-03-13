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
            alert('Please enter at least one blog title.');
            return;
        }

        const titles = text.split('\n').map(t => t.trim()).filter(t => t.length > 0);
        if (titles.length === 0) return;

        // Reset UI
        gallery.innerHTML = '';
        loader.classList.remove('hidden');
        generateBtn.disabled = true;

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                alert('Please sign in to use AI tools.');
                window.location.href = '/signin';
                return;
            }

            const response = await fetch('/api/generate-headers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ titles })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Failed to generate headers');
            }

            renderGallery(data.results);
            loadHistory(); // Refresh history sidebar after successful generation
        } catch (error) {
            console.error('Error generating headers:', error);
            alert('An error occurred: ' + error.message);
        } finally {
            loader.classList.add('hidden');
            generateBtn.disabled = false;
        }
    });

    async function loadHistory() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const res = await fetch('/api/header-history', {
                headers: { 'Authorization': `Bearer ${token}` }
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
            <div class="history-item" onclick="window.scrollToTool('${item.imageUrl}', '${item.title.replace(/'/g, "\\'")}')">
                <h4>${item.title}</h4>
                <div class="meta">${new Date(item.createdAt).toLocaleDateString()}</div>
            </div>
        `).join('');
    }

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
            alert('Failed to download image.');
        }
    };
});
