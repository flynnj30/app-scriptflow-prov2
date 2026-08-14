/* ================================================================
   ScriptFlow Pro - ICS Calendar Sync
   Targeted integration: imports standard ICS VEVENT records into
   the existing appointment/calendar data model without replacing it.
   ================================================================ */
(function (window) {
    'use strict';

    const ICSCalendarSync = {
        version: '1.0.0',

        normalizeText(value) {
            return String(value || '').replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
        },

        unfold(text) {
            return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
        },

        parseLines(text) {
            const lines = this.unfold(text).split('\n');
            const events = [];
            let current = null;
            for (const raw of lines) {
                const line = raw.trimEnd();
                if (line === 'BEGIN:VEVENT') { current = {}; continue; }
                if (line === 'END:VEVENT') {
                    if (current) events.push(current);
                    current = null;
                    continue;
                }
                if (!current || !line.includes(':')) continue;
                const colon = line.indexOf(':');
                const left = line.slice(0, colon);
                const value = this.normalizeText(line.slice(colon + 1));
                const parts = left.split(';');
                const key = parts.shift().toUpperCase();
                const params = {};
                parts.forEach(part => {
                    const eq = part.indexOf('=');
                    if (eq > -1) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
                });
                current[key] = { value, params };
            }
            return events;
        },

        parseDateTime(field) {
            if (!field || !field.value) return null;
            const raw = field.value.trim();
            const isDateOnly = field.params && String(field.params.VALUE || '').toUpperCase() === 'DATE';
            const tzid = field.params && (field.params.TZID || '');
            if (/^\d{8}$/.test(raw)) {
                return { date: `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`, time: '12:00 PM', timezone: this.mapTimezone(tzid || 'UTC'), allDay: true };
            }
            const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i);
            if (!match) return null;
            const year = +match[1], month = +match[2], day = +match[3], hour = +match[4], minute = +match[5];
            const seconds = +(match[6] || 0);
            if (hour > 23 || minute > 59 || seconds > 59) return null;
            const date = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const time = this.formatTime(hour, minute);
            const zone = match[7] ? 'UTC' : this.mapTimezone(tzid || 'Central CDT');
            return { date, time, timezone: zone, allDay: !!isDateOnly };
        },

        formatTime(hour, minute) {
            const suffix = hour >= 12 ? 'PM' : 'AM';
            const h = hour % 12 || 12;
            return `${h}:${String(minute).padStart(2,'0')} ${suffix}`;
        },

        mapTimezone(value) {
            const v = String(value || '').toUpperCase();
            if (v.includes('EASTERN') || v.includes('NEW_YORK') || v === 'EST' || v === 'EDT') return 'Eastern EDT';
            if (v.includes('MOUNTAIN') || v.includes('DENVER') || v === 'MST' || v === 'MDT') return 'Mountain MDT';
            if (v.includes('PACIFIC') || v.includes('LOS_ANGELES') || v === 'PST' || v === 'PDT') return 'Pacific PDT';
            if (v === 'UTC' || v === 'GMT') return 'UTC';
            return 'Central CDT';
        },

        getText(event, key) { return event[key] ? event[key].value : ''; },

        extractEmail(text) {
            const match = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
            return match ? match[0] : '';
        },

        parseEvent(event) {
            const start = this.parseDateTime(event.DTSTART);
            if (!start) return null;
            const summary = this.getText(event, 'SUMMARY');
            const description = this.getText(event, 'DESCRIPTION');
            const location = this.getText(event, 'LOCATION');
            const organizer = this.getText(event, 'ORGANIZER');
            const uid = this.getText(event, 'UID');
            const contactEmail = this.extractEmail(`${description}\n${organizer}`);

            let business = summary || 'ICS Meeting';
            let contactName = 'Calendar Contact';
            const businessMatch = description.match(/Business(?: Name)?\s*:\s*(.+)/i);
            const nameMatch = description.match(/(?:Name|Contact)\s*:\s*(.+)/i);
            if (businessMatch) business = businessMatch[1].trim();
            if (nameMatch) contactName = nameMatch[1].trim();

            return {
                externalId: uid || `${start.date}|${start.time}|${business}`,
                business: business.slice(0, 150),
                contactName: contactName.slice(0, 100),
                role: 'Owner',
                phone: '',
                email: contactEmail,
                date: start.date,
                time: start.time,
                timezone: start.timezone,
                notes: [summary, description, location].filter(Boolean).join('\n').slice(0, 4000),
                status: 'Meeting Booked',
                source: 'ics',
                icsUid: uid || '',
                allDay: !!start.allDay
            };
        },

        parse(text) {
            const raw = String(text || '');
            if (!/BEGIN:VCALENDAR/i.test(raw)) throw new Error('Invalid ICS file: VCALENDAR header not found.');
            const events = this.parseLines(raw).map(e => this.parseEvent(e)).filter(Boolean);
            return { events, totalEvents: this.parseLines(raw).length };
        },

        existingAppointments() {
            const list = [];
            if (typeof AppState === 'undefined') return list;
            Object.values(AppState.appointments || {}).forEach(bucket => {
                (bucket.reports || []).forEach(appt => list.push(appt));
            });
            return list;
        },

        findExisting(event) {
            return this.existingAppointments().find(appt => {
                if (event.icsUid && appt.icsUid && String(appt.icsUid) === String(event.icsUid)) return true;
                return appt.source === 'ics' && appt.business === event.business && appt.date === event.date && appt.time === event.time;
            }) || null;
        },

        async importText(text) {
            if (typeof Data === 'undefined' || typeof AppState === 'undefined') throw new Error('Calendar is not ready yet.');
            const parsed = this.parse(text);
            if (!parsed.events.length) return { imported: 0, updated: 0, skipped: 0, total: parsed.totalEvents };

            let imported = 0, updated = 0, skipped = 0;
            for (const event of parsed.events) {
                const existing = this.findExisting(event);
                if (existing) {
                    const changed = existing.date !== event.date || existing.time !== event.time || existing.timezone !== event.timezone || existing.business !== event.business || existing.contactName !== event.contactName || existing.notes !== event.notes;
                    if (changed) {
                        Data.updateAppointment(existing.date, existing.id, {
                            business: event.business,
                            contactName: event.contactName,
                            email: event.email || existing.email || '',
                            date: event.date,
                            time: event.time,
                            timezone: event.timezone,
                            notes: event.notes,
                            source: 'ics',
                            icsUid: event.icsUid
                        });
                        updated++;
                    } else skipped++;
                    continue;
                }
                const assigned = AppState.currentUser?.displayName || AppState.currentUser?.email || 'Unassigned';
                const closer = AppState.closers?.find(c => c.default)?.name || undefined;
                Data.addAppointment(event.date, event.business, event.contactName, event.role, event.phone, event.time, event.notes, assigned, null, event.status, '', [], closer, event.email, event.timezone, 'none');
                const added = (AppState.appointments[event.date]?.reports || []).at(-1);
                if (added) {
                    added.source = 'ics';
                    added.icsUid = event.icsUid;
                    added.allDay = event.allDay;
                    Data.syncAppointment(added);
                }
                imported++;
            }
            if (typeof Stats !== 'undefined') Stats.updateAll();
            if (typeof FeaturePanel !== 'undefined') FeaturePanel.refreshCurrentView();
            return { imported, updated, skipped, total: parsed.totalEvents };
        },

        async importFile(file) {
            if (!file) return null;
            const text = await file.text();
            return this.importText(text);
        },

        openFilePicker() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.ics,text/calendar';
            input.style.display = 'none';
            input.addEventListener('change', async () => {
                try {
                    const result = await this.importFile(input.files && input.files[0]);
                    if (!result) return;
                    if (result.total === 0) {
                        showToast('ICS feed is valid but contains no meetings.', 'info');
                    } else {
                        showToast(`ICS sync complete: ${result.imported} added, ${result.updated} updated${result.skipped ? `, ${result.skipped} unchanged` : ''}.`, 'success');
                    }
                } catch (error) {
                    console.error('ICS import error:', error);
                    showToast(error.message || 'Unable to import ICS calendar.', 'error');
                } finally {
                    input.remove();
                }
            }, { once: true });
            document.body.appendChild(input);
            input.click();
        }
    };

    window.ICSCalendarSync = ICSCalendarSync;
})(window);
