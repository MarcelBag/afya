import { showNotification } from './notifications.js';

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
    
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const image = document.getElementById('image').files[0];
      if (!image) {
        showErrorModal('Please select an image.');
        return;
      }
      
      const formData = new FormData();
      formData.append('image', image);
    
      try {
        const token = localStorage.getItem('token');
        if (!token) {
            showNotification('Please sign in to use AI tools.', 'warning');
            window.location.href = '/signin';
            return;
        }

        const res = await fetch('/api/upload-image', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token },
          body: formData
        });
    
        const data = await res.json();
        if (res.ok) {
          resultsSection.classList.remove('hidden');
          resultsContainer.innerHTML = `
            <h3>Analysis Type: ${data.analysisType || 'Predicted'}</h3>
            <p>Prediction: ${data.prediction}</p>
            <p>Confidence: ${data.confidence}%</p>
            <p>Melanoma is a cancer that develops from melanocytes, the cells that give skin its color </p>
            <p>While </p>
            <p>Benign is not harmful or severe, or not cancerous</p>
            <p> 
            Thus results are still on prediction and probability, please consult a doctor for further analysis.



            </p>
          `;
        } else {
          showErrorModal('Error analyzing the image: ' + data.message);
        }
      } catch (error) {
        console.error('Error:', error);
        showNotification('Something went wrong during image upload: ' + error.message, 'error');
      }
    });
  });