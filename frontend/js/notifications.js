/**
 * Afya Premium Notification System
 * Replaces basic browser alert() with elegant, animated toasts.
 */

export const showNotification = (message, type = 'info', duration = 5000) => {
    // Create container if it doesn't exist
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        document.body.appendChild(container);
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification toast-${type}`;
    
    // Choose icon based on type
    let icon = '🔔';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    notification.innerHTML = `
        <div class="notification-icon">${icon}</div>
        <div class="notification-content">
            <p class="notification-message">${message}</p>
        </div>
        <button class="notification-close">&times;</button>
        <div class="notification-progress"></div>
    `;

    // Add to container
    container.appendChild(notification);

    // Close logic
    const closeBtn = notification.querySelector('.notification-close');
    const close = () => {
        notification.classList.add('fade-out');
        notification.addEventListener('animationend', () => notification.remove());
    };

    closeBtn.addEventListener('click', close);

    // Auto-close with progress bar
    const progressBar = notification.querySelector('.notification-progress');
    progressBar.style.animationDuration = `${duration}ms`;
    
    const timeoutId = setTimeout(close, duration);

    // Pause on hover
    notification.addEventListener('mouseenter', () => {
        clearTimeout(timeoutId);
        progressBar.style.animationPlayState = 'paused';
    });

    notification.addEventListener('mouseleave', () => {
        // Simple resume logic - just close after a short delay or stay open
        // For simplicity, we'll just let it stay open or close immediately
        setTimeout(close, 2000); 
    });
};

// Global helper for simple alert replacement
window.showNotification = showNotification;
