# Startbildschirm Designer (Firefox Extension)

Mit dieser Firefox-Extension kannst du deine New-Tab-Seite und Startseite gestalten.

## Funktionen

- Eigener Startbildschirm fuer neue Tabs
- Eigene Firefox-Startseite beim Browserstart
- Titel und Untertitel frei konfigurierbar
- Uhr ein/aus
- Farbverlauf und Akzentfarbe anpassbar
- Optionales Hintergrundbild per URL
- Dashboard-Kacheln mit Kategorien (Work, Social, Learning, ...)
- Kalender-Widget und Pomodoro-Widget

## Installation (temporar)

1. Firefox oeffnen.
2. `about:debugging#/runtime/this-firefox` aufrufen.
3. Auf `Temporare Add-ons laden...` klicken.
4. Die Datei `manifest.json` in diesem Ordner auswaehlen.

## Nutzung

1. Einen neuen Tab oeffnen -> die eigene Startseite erscheint.
2. Oben rechts auf `Anpassen` klicken oder die Add-on-Einstellungen in Firefox oeffnen.
3. Einstellungen speichern und neuen Tab oeffnen.

### Link-Format fuer Dashboard-Kacheln

In den Einstellungen unter `Dashboard-Links` gilt pro Zeile:

`Kategorie|Name|https://url`

Beispiel:

`Work|Gmail|https://mail.google.com`

## Damit es beim Firefox-Start angezeigt wird

Firefox kann beim Start auch letzte Tabs/Fenster wiederherstellen. Dann siehst du nicht automatisch die Startseite.

Stelle deshalb in Firefox ein:

1. `Einstellungen -> Allgemein -> Start`.
2. Bei `Beim Start von Firefox` die Option `Startseite anzeigen` auswaehlen (nicht `Fenster und Tabs der letzten Sitzung anzeigen`).
3. Unter `Startseite und neue Fenster` sollte die Erweiterung als Startseite aktiv sein.

## Hinweis

Die temporare Installation bleibt nur bis zum naechsten Firefox-Neustart aktiv.
