// ================================================================
// NOTIFICATION SYSTEM - CENTRALIZED MODULE
// ================================================================

/**
 * NotificationSystem - Centralized notification management
 * Handles callback notifications, popups, dropdown, and persistent storage
 */
const NotificationSystem = {
    // State
    notifications: [],
    unreadCount: 0,
    popupTimers: new Map(),
    isDropdownOpen: false,
    initialized: false,
    popupQueue: [],
    isPopupShowing: false,
    maxPopups: 3,
    popupStack: [],
    currentFilter: 'all',
    notificationSound: null,
    isSoundEnabled: true,

    /**
     * Initialize the notification system
     */
    init: function() {
        if (this.initialized) return;
        this.initialized = true;
        
        // Load saved notifications from localStorage
        this.loadNotifications();
        
        // Update UI
        this.renderBell();
        this.renderDropdown();
        this.updateBadge();
        this.attachEvents();
        
        // Start cleanup interval
        setInterval(() => {
            this.cleanupExpired();
        }, 60000);
        
        // Preload notification sound
        this.preloadSound();
        
        console.log('🔔 Notification System initialized');
        console.log(`📬 ${this.notifications.length} notifications loaded, ${this.unreadCount} unread`);
    },

    /**
     * Load notifications from localStorage
     */
    loadNotifications: function() {
        try {
            const saved = localStorage.getItem('scriptflow_notifications');
            if (saved) {
                const data = JSON.parse(saved);
                this.notifications = data.notifications || [];
                this.unreadCount = this.notifications.filter(n => !n.read && !n.dismissed).length;
            } else {
                // Try legacy format
                const legacy = localStorage.getItem('callbackNotifications_v2');
                if (legacy) {
                    this.notifications = JSON.parse(legacy);
                    this.unreadCount = this.notifications.filter(n => !n.read && !n.dismissed).length;
                    // Migrate to new format
                    this.saveNotifications();
                }
            }
        } catch (e) {
            console.warn('Failed to load notifications:', e);
            this.notifications = [];
            this.unreadCount = 0;
        }
    },

    /**
     * Save notifications to localStorage
     */
    saveNotifications: function() {
        try {
            localStorage.setItem('scriptflow_notifications', JSON.stringify({
                notifications: this.notifications,
                lastUpdated: new Date().toISOString()
            }));
        } catch (e) {
            console.warn('Failed to save notifications:', e);
        }
    },

    /**
     * Preload notification sound
     */
    preloadSound: function() {
        try {
            // Use Web Audio API for notification sound
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            // Pre-create the sound buffer
            this.notificationSound = audioCtx;
        } catch (e) {
            // Silently fail - sound will be created on demand
        }
    },

    /**
     * Add a new notification
     * @param {Object} appt - Appointment object
     * @param {string} type - Notification type ('callback_due', 'callback_completed')
     * @returns {Object} The created/updated notification
     */
    addNotification: function(appt, type = 'callback_due') {
        if (!appt || !appt.id) {
            console.warn('Cannot add notification: invalid appointment', appt);
            return null;
        }

        const id = 'notif_' + Utils.generateId();
        const now = new Date().toISOString();
        
        // Check if notification already exists for this appointment
        const existing = this.notifications.find(n => 
            n.appointmentId === appt.id && 
            n.type === type &&
            !n.dismissed
        );
        
        if (existing) {
            // Update existing notification
            existing.timestamp = now;
            existing.read = false;
            existing.count = (existing.count || 1) + 1;
            existing.message = this.getNotificationMessage(appt, type);
            this.saveNotifications();
            this.updateBadge();
            this.renderDropdown();
            this.showPopup(existing);
            return existing;
        }
        
        // Calculate callback time
        const callbackTime = typeof TimezoneUtils !== 'undefined' ? 
            TimezoneUtils.calculateCallbackTime(appt) : null;
        const formattedCallbackTime = callbackTime ? 
            this.formatCallbackTime(appt) : 'Not scheduled';
        
        const notification = {
            id: id,
            appointmentId: appt.id,
            type: type,
            business: appt.business || 'Unknown Business',
            contactName: appt.contactName || 'Unknown Contact',
            phone: appt.phone || '',
            email: appt.email || '',
            date: appt.date || '',
            time: appt.time || '',
            timezone: appt.timezone || 'Central CDT',
            callbackTime: callbackTime ? callbackTime.toISOString() : null,
            formattedCallbackTime: formattedCallbackTime,
            message: this.getNotificationMessage(appt, type),
            timestamp: now,
            read: false,
            dismissed: false,
            count: 1,
            createdAt: now
        };
        
        // Check if duplicate in last 5 minutes
        const recentDuplicate = this.notifications.find(n => 
            n.appointmentId === appt.id && 
            n.type === type &&
            !n.dismissed &&
            new Date(n.timestamp).getTime() > new Date().getTime() - 5 * 60 * 1000
        );
        
        if (recentDuplicate) {
            return recentDuplicate;
        }
        
        // Add to beginning of array
        this.notifications.unshift(notification);
        this.unreadCount++;
        this.saveNotifications();
        this.updateBadge();
        this.renderDropdown();
        
        // Show popup notification
        this.showPopup(notification);
        this.animateBell();
        this.playNotificationSound();
        
        return notification;
    },

    /**
     * Get notification message based on type
     */
    getNotificationMessage: function(appt, type) {
        const business = appt.business || 'Unknown Business';
        switch (type) {
            case 'callback_due':
                return `${business} is ready for your callback now.`;
            case 'callback_completed':
                return `${business} callback has been completed.`;
            case 'appointment_reminder':
                return `Reminder: ${business} appointment is coming up.`;
            default:
                return `${business} notification.`;
        }
    },

    /**
     * Format callback time for display
     */
    formatCallbackTime: function(appt) {
        if (typeof TimezoneUtils !== 'undefined') {
            return TimezoneUtils.formatCallbackTime(appt);
        }
        // Fallback formatting
        const callbackTime = this.calculateCallbackTimeFallback(appt);
        if (!callbackTime) return 'Not scheduled';
        return callbackTime.toLocaleString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
    },

    /**
     * Fallback callback time calculation
     */
    calculateCallbackTimeFallback: function(appointment) {
        if (!appointment || !appointment.date || !appointment.callbackSetting || appointment.callbackSetting === 'none') {
            return null;
        }
        try {
            const date = new Date(appointment.date + 'T00:00:00');
            if (isNaN(date.getTime())) return null;
            
            let hour = 9, minute = 0;
            if (appointment.time) {
                const timeMatch = appointment.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
                if (timeMatch) {
                    hour = parseInt(timeMatch[1]);
                    minute = parseInt(timeMatch[2]);
                    if (timeMatch[3].toUpperCase() === 'PM' && hour < 12) hour += 12;
                    if (timeMatch[3].toUpperCase() === 'AM' && hour === 12) hour = 0;
                }
            }
            date.setHours(hour, minute, 0, 0);
            
            let offsetMs = 0;
            if (appointment.callbackSetting === '24h') offsetMs = 24 * 60 * 60 * 1000;
            else if (appointment.callbackSetting === '4h') offsetMs = 4 * 60 * 60 * 1000;
            else if (appointment.callbackSetting === '1h') offsetMs = 60 * 60 * 1000;
            else if (appointment.callbackSetting === 'custom' && appointment.callbackCustomValue) {
                const value = parseInt(appointment.callbackCustomValue);
                const unit = appointment.callbackCustomUnit || 'hours';
                if (unit === 'hours') offsetMs = value * 60 * 60 * 1000;
                else if (unit === 'minutes') offsetMs = value * 60 * 1000;
                else if (unit === 'days') offsetMs = value * 24 * 60 * 60 * 1000;
            }
            if (offsetMs === 0) return null;
            return new Date(date.getTime() - offsetMs);
        } catch (e) {
            return null;
        }
    },

    /**
     * Show popup notification
     */
    showPopup: function(notification) {
        if (!notification || notification.dismissed) return;
        this.popupQueue.push(notification);
        this.processPopupQueue();
    },

    /**
     * Process the popup queue
     */
    processPopupQueue: function() {
        if (this.isPopupShowing || this.popupQueue.length === 0) return;
        
        // Remove oldest if max reached
        while (this.popupStack.length >= this.maxPopups) {
            const oldestId = this.popupStack.shift();
            const el = document.getElementById(oldestId);
            if (el) {
                el.classList.add('removing');
                setTimeout(() => {
                    if (el.parentNode) el.remove();
                }, 300);
            }
        }
        
        const notification = this.popupQueue.shift();
        this.isPopupShowing = true;
        this.createPopupElement(notification);
    },

    /**
     * Create popup DOM element
     */
    createPopupElement: function(notification) {
        const popupId = 'popup_' + notification.id;
        
        if (document.getElementById(popupId)) {
            this.isPopupShowing = false;
            this.processPopupQueue();
            return;
        }
        
        const isDue = notification.type === 'callback_due';
        const callbackTime = notification.formattedCallbackTime || 'Not scheduled';
        
        const popup = document.createElement('div');
        popup.id = popupId;
        popup.className = `notification-popup ${isDue ? 'callback-due' : 'callback-completed'}`;
        popup.innerHTML = `
            <div class="popup-header">
                <div class="popup-title">
                    <span class="icon">${isDue ? '⏰' : '✅'}</span>
                    ${isDue ? 'Callback Due' : 'Callback Completed'}
                </div>
                <button class="popup-close" data-popup-id="${popupId}" aria-label="Close notification">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="popup-body">
                <span class="business-name">${Utils.escapeHtml(notification.business)}</span>
                ${notification.contactName ? ` — ${Utils.escapeHtml(notification.contactName)}` : ''}
                <div class="popup-time">⏱️ ${callbackTime}</div>
            </div>
            <div class="popup-actions">
                <button class="btn-icon view-btn" data-appt-id="${notification.appointmentId}">
                    <i class="fas fa-eye"></i> View
                </button>
                <button class="btn-icon dismiss-btn" data-popup-id="${popupId}" data-notif-id="${notification.id}">
                    <i class="fas fa-times"></i> Dismiss
                </button>
                <button class="btn-icon snooze-btn" data-notif-id="${notification.id}" data-popup-id="${popupId}">
                    <i class="fas fa-clock"></i> Snooze
                </button>
            </div>
        `;
        
        // Add to stack container
        let stack = document.querySelector('.notification-popup-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.className = 'notification-popup-stack';
            document.body.appendChild(stack);
        }
        
        stack.appendChild(popup);
        this.popupStack.push(popupId);
        
        // Attach events
        this.attachPopupEvents(popup, popupId, notification);
        
        // Auto-dismiss after 15 seconds
        const timerId = setTimeout(() => {
            this.dismissPopup(popupId, notification.id);
        }, 15000);
        this.popupTimers.set(popupId, timerId);
        
        // Track removal
        const observer = new MutationObserver(() => {
            if (!document.getElementById(popupId)) {
                this.popupStack = this.popupStack.filter(id => id !== popupId);
                observer.disconnect();
                this.isPopupShowing = false;
                this.processPopupQueue();
            }
        });
        observer.observe(document.body, { childList: true });
        
        // Mark as read in dropdown
        this.markAsRead(notification.id);
    },

    /**
     * Attach events to popup elements
     */
    attachPopupEvents: function(popup, popupId, notification) {
        popup.querySelector('.popup-close').addEventListener('click', () => {
            this.dismissPopup(popupId, notification.id);
        });
        
        popup.querySelector('.view-btn').addEventListener('click', () => {
            this.dismissPopup(popupId, notification.id);
            this.openAppointmentDetail(notification.appointmentId);
        });
        
        popup.querySelector('.dismiss-btn').addEventListener('click', () => {
            this.dismissPopup(popupId, notification.id);
            this.markAsRead(notification.id);
            this.dismissNotification(notification.id);
        });
        
        popup.querySelector('.snooze-btn').addEventListener('click', () => {
            this.snoozeNotification(notification.id, popupId);
        });
    },

    /**
     * Open appointment detail
     */
    openAppointmentDetail: function(appointmentId) {
        if (typeof window.showAppointmentDetail === 'function') {
            window.showAppointmentDetail(appointmentId);
        } else {
            // Fallback: try to find and open the appointment
            const appt = typeof Data !== 'undefined' ? Data.getAppointmentById(appointmentId) : null;
            if (appt) {
                showToast(`Opening ${appt.business}`, 'info');
            }
        }
    },

    /**
     * Dismiss popup
     */
    dismissPopup: function(popupId, notifId) {
        const popup = document.getElementById(popupId);
        if (popup) {
            popup.classList.add('removing');
            setTimeout(() => {
                if (popup.parentNode) popup.remove();
                this.popupStack = this.popupStack.filter(id => id !== popupId);
            }, 300);
        }
        
        if (this.popupTimers.has(popupId)) {
            clearTimeout(this.popupTimers.get(popupId));
            this.popupTimers.delete(popupId);
        }
        
        if (notifId) {
            this.markAsRead(notifId);
        }
        
        this.isPopupShowing = false;
        setTimeout(() => this.processPopupQueue(), 100);
    },

    /**
     * Snooze notification
     */
    snoozeNotification: function(notifId, popupId) {
        const notification = this.notifications.find(n => n.id === notifId);
        if (notification) {
            // Snooze for 5 minutes
            const snoozeTime = new Date();
            snoozeTime.setMinutes(snoozeTime.getMinutes() + 5);
            notification.snoozedUntil = snoozeTime.toISOString();
            notification.read = true;
            this.saveNotifications();
            this.updateBadge();
            this.renderDropdown();
            this.dismissPopup(popupId, notifId);
            
            showToast('🔔 Reminded in 5 minutes', 'info');
            
            // Reschedule
            setTimeout(() => {
                const notif = this.notifications.find(n => n.id === notifId);
                if (notif && !notif.dismissed) {
                    notif.read = false;
                    this.unreadCount++;
                    this.saveNotifications();
                    this.updateBadge();
                    this.renderDropdown();
                    this.showPopup(notif);
                }
            }, 5 * 60 * 1000);
        }
    },

    /**
     * Mark notification as read
     */
    markAsRead: function(notifId) {
        const notification = this.notifications.find(n => n.id === notifId);
        if (notification && !notification.read) {
            notification.read = true;
            this.unreadCount = Math.max(0, this.unreadCount - 1);
            this.saveNotifications();
            this.updateBadge();
            this.renderDropdown();
        }
    },

    /**
     * Mark all notifications as read
     */
    markAllAsRead: function() {
        let count = 0;
        this.notifications.forEach(n => {
            if (!n.read && !n.dismissed) {
                n.read = true;
                count++;
            }
        });
        if (count > 0) {
            this.unreadCount = 0;
            this.saveNotifications();
            this.updateBadge();
            this.renderDropdown();
            showToast(`Marked ${count} notifications as read`, 'success');
        }
    },

    /**
     * Dismiss notification permanently
     */
    dismissNotification: function(notifId) {
        const notification = this.notifications.find(n => n.id === notifId);
        if (notification) {
            notification.dismissed = true;
            notification.read = true;
            this.unreadCount = Math.max(0, this.unreadCount - 1);
            this.saveNotifications();
            this.updateBadge();
            this.renderDropdown();
            
            // Remove popup
            const popupId = 'popup_' + notifId;
            const popup = document.getElementById(popupId);
            if (popup) {
                popup.classList.add('removing');
                setTimeout(() => {
                    if (popup.parentNode) popup.remove();
                    this.popupStack = this.popupStack.filter(id => id !== popupId);
                }, 300);
            }
            
            showToast('Notification dismissed', 'info');
        }
    },

    /**
     * Update notification badge
     */
    updateBadge: function() {
        // Main badge on bell
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            if (this.unreadCount > 0) {
                badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
        
        // Count badge in header
        const countBadge = document.getElementById('notificationCountBadge');
        if (countBadge) {
            const total = this.notifications.filter(n => !n.dismissed).length;
            countBadge.textContent = total;
        }
        
        // Account badge
        const accountBadge = document.getElementById('notificationAccountBadge');
        if (accountBadge) {
            const total = this.notifications.filter(n => !n.dismissed).length;
            accountBadge.textContent = total;
        }
        
        // Bell animation
        const bell = document.querySelector('.notification-bell');
        if (bell) {
            if (this.unreadCount > 0) {
                bell.classList.add('has-unread');
            } else {
                bell.classList.remove('has-unread');
            }
        }
    },

    /**
     * Animate bell
     */
    animateBell: function() {
        const bell = document.querySelector('.notification-bell');
        if (bell) {
            bell.classList.remove('has-unread');
            void bell.offsetWidth;
            bell.classList.add('has-unread');
        }
    },

    /**
     * Play notification sound
     */
    playNotificationSound: function() {
        if (!this.isSoundEnabled) return;
        try {
            const audioCtx = this.notificationSound || new (window.AudioContext || window.webkitAudioContext)();
            if (!this.notificationSound) {
                this.notificationSound = audioCtx;
            }
            
            // Play two-tone notification sound
            const notes = [800, 600];
            notes.forEach((freq, index) => {
                const oscillator = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();
                oscillator.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                oscillator.frequency.value = freq;
                oscillator.type = 'sine';
                const startTime = audioCtx.currentTime + (index * 0.15);
                gainNode.gain.setValueAtTime(0.15, startTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);
                oscillator.start(startTime);
                oscillator.stop(startTime + 0.15);
            });
        } catch (e) {
            // Silently fail - sound is optional
        }
    },

    /**
     * Render bell icon
     */
    renderBell: function() {
        this.updateBadge();
        this.attachEvents();
    },

    /**
     * Render dropdown
     */
    renderDropdown: function() {
        const body = document.getElementById('notificationDropdownBody');
        if (!body) return;
        
        let filtered = this.notifications.filter(n => !n.dismissed);
        
        switch (this.currentFilter) {
            case 'unread':
                filtered = filtered.filter(n => !n.read);
                break;
            case 'callback_due':
                filtered = filtered.filter(n => n.type === 'callback_due' && !n.read);
                break;
            case 'archived':
                filtered = filtered.filter(n => n.read);
                break;
            default:
                break;
        }
        
        if (filtered.length === 0) {
            body.innerHTML = `
                <div class="empty-notifications">
                    <i class="fas fa-bell-slash"></i>
                    <p>No notifications</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        filtered.slice(0, 50).forEach(n => {
            const isUnread = !n.read;
            const isDue = n.type === 'callback_due';
            const timeAgo = this.getTimeAgo(n.timestamp);
            const callbackTime = n.formattedCallbackTime || 'Not scheduled';
            
            html += `
                <div class="notification-item ${isUnread ? 'unread' : 'read'}" data-notif-id="${n.id}">
                    <div class="notif-icon ${isDue ? 'callback-due' : 'callback-completed'}">
                        ${isDue ? '⏰' : '✅'}
                    </div>
                    <div class="notif-content">
                        <div class="notif-title">${isDue ? 'Callback due' : 'Callback completed'}</div>
                        <div class="notif-business">${Utils.escapeHtml(n.business)}${n.contactName ? ` — ${Utils.escapeHtml(n.contactName)}` : ''}</div>
                        <div class="notif-time">
                            <i class="far fa-clock"></i>
                            ${timeAgo}
                            ${n.count > 1 ? ` · ${n.count} reminders` : ''}
                            ${callbackTime !== 'Not scheduled' ? ` · ${callbackTime}` : ''}
                        </div>
                    </div>
                    <div class="notif-actions">
                        ${isUnread ? `<button class="mark-read-btn" data-notif-id="${n.id}" title="Mark as read"><i class="fas fa-check"></i></button>` : ''}
                        <button class="view-btn" data-appt-id="${n.appointmentId}" title="View appointment"><i class="fas fa-eye"></i></button>
                        <button class="dismiss-btn" data-notif-id="${n.id}" title="Dismiss"><i class="fas fa-times"></i></button>
                    </div>
                </div>
            `;
        });
        
        body.innerHTML = html;
        this.attachDropdownEvents(body);
    },

    /**
     * Attach dropdown events
     */
    attachDropdownEvents: function(body) {
        body.querySelectorAll('.mark-read-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.markAsRead(btn.dataset.notifId);
            });
        });
        
        body.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openAppointmentDetail(btn.dataset.apptId);
                this.closeDropdown();
            });
        });
        
        body.querySelectorAll('.dismiss-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.dismissNotification(btn.dataset.notifId);
            });
        });
        
        body.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', () => {
                const notifId = item.dataset.notifId;
                if (notifId) {
                    this.markAsRead(notifId);
                }
            });
        });
    },

    /**
     * Get time ago string
     */
    getTimeAgo: function(timestamp) {
        const now = new Date();
        const then = new Date(timestamp);
        const diffMs = now - then;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    },

    /**
     * Clean up expired notifications
     */
    cleanupExpired: function() {
        const now = new Date();
        let changed = false;
        
        this.notifications = this.notifications.filter(n => {
            const age = now - new Date(n.timestamp);
            // Remove notifications older than 7 days
            if (age > 7 * 24 * 60 * 60 * 1000) {
                changed = true;
                return false;
            }
            return true;
        });
        
        if (changed) {
            this.unreadCount = this.notifications.filter(n => !n.read && !n.dismissed).length;
            this.saveNotifications();
            this.updateBadge();
            this.renderDropdown();
        }
    },

    /**
     * Toggle dropdown
     */
    toggleDropdown: function() {
        const dropdown = document.getElementById('notificationDropdown');
        if (dropdown) {
            this.isDropdownOpen = !this.isDropdownOpen;
            dropdown.classList.toggle('open');
            if (this.isDropdownOpen) {
                // Close other dropdowns
                document.querySelectorAll('.notification-dropdown.open').forEach(d => {
                    if (d !== dropdown) d.classList.remove('open');
                });
                this.renderDropdown();
            }
        }
    },

    /**
     * Close dropdown
     */
    closeDropdown: function() {
        const dropdown = document.getElementById('notificationDropdown');
        if (dropdown) {
            dropdown.classList.remove('open');
            this.isDropdownOpen = false;
        }
    },

    /**
     * Set filter
     */
    setFilter: function(filter) {
        this.currentFilter = filter;
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.filter === filter);
        });
        this.renderDropdown();
    },

    /**
     * Attach global events
     */
    attachEvents: function() {
        // Bell button
        const bellBtn = document.getElementById('notificationBellBtn');
        if (bellBtn) {
            // Remove existing listeners by cloning
            const newBellBtn = bellBtn.cloneNode(true);
            bellBtn.parentNode.replaceChild(newBellBtn, bellBtn);
            newBellBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown();
            });
        }
        
        // Mark all read buttons
        ['markAllReadBtn', 'markAllReadFooterBtn'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
                newBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.markAllAsRead();
                });
            }
        });
        
        // Filter tabs
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.setFilter(tab.dataset.filter);
            });
        });
        
        // Click outside to close
        document.addEventListener('click', (e) => {
            const container = document.querySelector('.notification-bell-container');
            if (container && !container.contains(e.target)) {
                this.closeDropdown();
            }
        });
        
        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isDropdownOpen) {
                this.closeDropdown();
            }
        });
    },

    /**
     * Get total notification count
     */
    getTotalCount: function() {
        return this.notifications.filter(n => !n.dismissed).length;
    },

    /**
     * Get unread count
     */
    getUnreadCount: function() {
        return this.unreadCount;
    },

    /**
     * Clear all notifications
     */
    clearAll: function() {
        if (confirm('Clear all notifications?')) {
            this.notifications = [];
            this.unreadCount = 0;
            this.saveNotifications();
            this.updateBadge();
            this.renderDropdown();
            showToast('All notifications cleared', 'info');
        }
    }
};

// ================================================================
// INTEGRATION WITH EXISTING CODE
// ================================================================

// Extend Data object with notification methods
if (typeof Data !== 'undefined') {
    // Override checkDueCallbacks to use notification system
    const originalCheckDueCallbacks = Data.checkDueCallbacks;
    Data.checkDueCallbacks = function() {
        const allAppointments = this.getAllAppointments();
        const dueAppointments = [];
        
        for (const appt of allAppointments) {
            if (appt.callbackTriggered) continue;
            if (!appt.callbackSetting || appt.callbackSetting === 'none') continue;
            
            const status = Utils.getStatus(appt);
            if (status === 'Completed' || status === 'Canceled') continue;
            
            // Use timezone-aware check if available
            let isDue = false;
            if (typeof TimezoneUtils !== 'undefined' && TimezoneUtils.isCallbackDue) {
                isDue = TimezoneUtils.isCallbackDue(appt);
            } else {
                // Fallback: use simple check
                const callbackTime = NotificationSystem.calculateCallbackTimeFallback(appt);
                if (callbackTime) {
                    const now = new Date();
                    const timeDiff = now.getTime() - callbackTime.getTime();
                    isDue = timeDiff >= 0 && timeDiff < 5 * 60 * 1000;
                }
            }
            
            if (isDue) {
                dueAppointments.push(appt);
            }
        }
        
        for (const appt of dueAppointments) {
            NotificationSystem.addNotification(appt, 'callback_due');
            this.updateAppointment(appt.date, appt.id, { callbackTriggered: true });
        }
    };
}

// Initialize notification system after app is ready
document.addEventListener('DOMContentLoaded', function() {
    // Wait for app to initialize
    const checkInterval = setInterval(function() {
        if (typeof AppState !== 'undefined' && AppState.isAppReady) {
            clearInterval(checkInterval);
            setTimeout(function() {
                NotificationSystem.init();
            }, 1000);
        }
    }, 500);
    
    // Safety timeout
    setTimeout(function() {
        if (!NotificationSystem.initialized) {
            NotificationSystem.init();
        }
    }, 5000);
});

// Expose to global scope
window.NotificationSystem = NotificationSystem;

console.log('📦 Notification module loaded');