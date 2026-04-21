import { showNotification } from './notifications.js';
import { fetchAnalysisHistory } from './analysis_history.js';
import { authHeaders, hasAppAuth } from './auth_fetch.js';

document.addEventListener('DOMContentLoaded', () => {
    function showErrorModal(message) {
      const modal = document.getElementById('error-modal');
      const errorMessage = document.getElementById('error-message');
      errorMessage.textContent = message;
      modal.classList.remove('hidden');
    }
  
    function hideErrorModal() {
      const modal = document.getElementById('error-modal');
      modal.classList.add('hidden');
    }
  
    const closeErrorBtn = document.getElementById('close-error');
    if (closeErrorBtn) {
      closeErrorBtn.addEventListener('click', hideErrorModal);
    }
    
    const uploadForm = document.getElementById('upload-form');
    if (!uploadForm) {
      console.error('Upload form not found!');
      return;
    }
    
    const resultsSection = document.getElementById('results-section');
    const resultsContainer = document.getElementById('results');
    const uploadSection = document.getElementById('upload-section');
    const loadingSection = document.getElementById('analysis-loading');
    const loadingStatus = document.getElementById('loading-status');
    const loadingProgress = document.getElementById('loading-progress');

    let loadingInterval;

    function startLoading() {
      resultsSection.classList.add('hidden');
      uploadSection.classList.add('hidden'); // Hide form during analysis
      loadingSection.classList.remove('hidden');
      loadingProgress.style.width = '0%';
      
      const messages = [
        "Initializing AI analysis...",
        "Scanning image features...",
        "Detecting skin tone patterns...",
        "Running neural classification...",
        "Finalizing diagnostic report...",
        "Double-checking AI confidence..."
      ];
      
      let step = 0;
      let progress = 0;
      
      loadingInterval = setInterval(() => {
        if (progress < 95) {
          progress += Math.random() * 5;
          if (progress > 95) progress = 95;
          loadingProgress.style.width = `${progress}%`;
        }
        
        if (progress > (step + 1) * 15 && step < messages.length - 1) {
          step++;
          loadingStatus.textContent = messages[step];
        }
      }, 400);
    }

    function stopLoading(success = true) {
      clearInterval(loadingInterval);
      if (success) {
        loadingProgress.style.width = '100%';
        setTimeout(() => {
          loadingSection.classList.add('hidden');
        }, 300);
      } else {
        loadingSection.classList.add('hidden');
        uploadSection.classList.remove('hidden'); // Show form again if failed
      }
    }

    function resetAnalysisView() {
        resultsSection.classList.add('hidden');
        loadingSection.classList.add('hidden');
        uploadSection.classList.remove('hidden');
        uploadForm.reset();
        window.scrollTo({ top: uploadSection.offsetTop - 100, behavior: 'smooth' });
    }
    
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const image = document.getElementById('image').files[0];
      if (!image) {
        showErrorModal('Please select an image.');
        return;
      }
      
      startLoading();
      
      const formData = new FormData();
      formData.append('image', image);
    
      try {
        if (!hasAppAuth()) {
            stopLoading(false);
            showNotification('Please sign in to use AI tools.', 'warning');
            window.location.href = '/signin';
            return;
        }

        const res = await fetch('/api/upload-image', {
          method: 'POST',
          headers: authHeaders(),
          body: formData
        });
    
        const data = await res.json();
        
        stopLoading(res.ok || res.status === 400);
        resultsSection.classList.remove('hidden');

        if (res.ok) {
          fetchAnalysisHistory(); 
          
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
            <p style="color: #718096; font-size: 0.9rem;">The AI has identified the features shown in the image.</p>
            
            <div class="progress-track" style="margin-top: 20px;">
              <div class="progress-fill" style="width: ${confidence}%"></div>
            </div>
            <div class="result-meta">
              <span>Confidence: <strong>${confidence}%</strong></span>
              <span>Type: ${data.analysisType || prediction}</span>
            </div>
            
            <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid #edf2f7; font-size: 0.88rem; line-height: 1.6; color: #4a5568;">
              <p><strong>AI Assessment:</strong> ${isMalignant ? 'Potential high risk detected. Please consult a dermatologist urgently.' : (isCommon ? 'This appears to be a common skin condition or benign feature.' : 'The features are complex. Professional evaluation is recommended.')}</p>
            </div>
            
            <button id="analyze-new" class="cta-btn" style="width: 100%; margin-top: 25px;">Analyze New Photo</button>
          `;
          
          document.getElementById('analyze-new').onclick = resetAnalysisView;
          resultsSection.scrollIntoView({ behavior: 'smooth' });
        } else if (res.status === 400) {
          let message = data.message;
          if (message.includes('insufficient skin tone')) {
             message = "Please post a skin close-up (no skin detected).";
          } else if (message.includes('person or face detected')) {
             message = "Please post a skin close-up (person or face detected).";
          }

          resultsContainer.innerHTML = `
            <div class="status-badge status-notice">Action Required</div>
            <h3 style="margin-bottom: 5px;">Invalid Image</h3>
            <p style="color: #4a5568; line-height: 1.6;">${message}</p>
            <button id="try-again" class="cta-btn" style="width: 100%; margin-top: 20px;">Try Different Photo</button>
          `;
          document.getElementById('try-again').onclick = resetAnalysisView;
          resultsSection.scrollIntoView({ behavior: 'smooth' });
        } else {
          showErrorModal('System Error: ' + data.message);
        }
      } catch (error) {
        stopLoading(false);
        console.error('Error:', error);
        showNotification('Something went wrong during image upload: ' + error.message, 'error');
      }
    });
  });
