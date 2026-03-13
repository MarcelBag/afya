document.addEventListener('DOMContentLoaded', () => {
    const titlesTextarea = document.getElementById('blog-titles');
    const generateBtn = document.getElementById('generate-btn');
    const gallery = document.getElementById('results-gallery');
    const loader = document.getElementById('loader');

    generateBtn.addEventListener('click', async () => {
        const text = titlesTextarea.value.trim();
        if (!text) {
            alert('Please enter at least one blog title.');
            return;
        }

        const titles = text.split('\n').map(t => t.trim()).filter(t => t.length > 0);
        if (titles.length === 0) return;

        // Reset UI
        gallery.innerHTML = '';
        loader.style.display = 'block';
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

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to generate headers');
            }

            const data = await response.json();
            renderGallery(data.results);
        } catch (error) {
            console.error('Error generating headers:', error);
            alert('An error occurred: ' + error.message);
        } finally {
            loader.style.display = 'none';
            generateBtn.disabled = false;
        }
    });

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
                    <img src="${result.image}" alt="${result.title}" loading="lazy">
                    <div class="gallery-card-content">
                        ${result.title}
                    </div>
                `;
            }
            
            gallery.appendChild(card);
        });
    }
});
