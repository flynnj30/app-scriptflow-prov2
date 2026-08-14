ScriptFlow Pro - ICS Calendar Sync

Targeted update:
- Added js/ics-calendar-sync.js.
- Added an Import ICS button to the existing Calendar toolbar.
- Parses standard VCALENDAR/VEVENT records.
- Maps DTSTART, SUMMARY, DESCRIPTION, LOCATION, ORGANIZER, and UID into the existing appointment model.
- Deduplicates ICS events using UID when available, with a business/date/time fallback.
- Updates existing imported appointments when their date/time/details change.
- Uses the existing Data.addAppointment / Data.updateAppointment / Data.syncAppointment flows, preserving Firebase/local fallback behavior.
- Does not replace the existing calendar renderer or appointment structure.

Important:
The attached regen-digital-meetings.ics feed is structurally valid but contains zero VEVENT entries. Therefore there are no meetings to display from this specific file. Importing it will safely report that the feed contains no meetings.

For a populated ICS feed, use Calendar > Import ICS and select the .ics file. Imported meetings will appear in the existing Month/Week/Day/List views and remain part of the existing appointment data model.
