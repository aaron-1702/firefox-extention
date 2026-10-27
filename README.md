# Startbildschirm Designer (Firefox Extension) (Beta)

Mit dieser Firefox-Extension kannst du deine New-Tab-Seite und Startseite gestalten.

## Funktionen

- Eigener Startbildschirm fuer neue Tabs
- Eigene Firefox-Startseite beim Browserstart
- Titel und Untertitel frei konfigurierbar
- Uhr ein/aus
- Farbverlauf und Akzentfarbe anpassbar
- Wallpaper Upload (png/jpg/mp4) direkt auf der Startseite
- Direktes In-Place-Editing ohne separaten Bearbeitungsmodus
- Kacheln per Long-Press + Drag frei positionierbar
- Kachelmenues (+ und ...) sowie Linkmenue (⋮) direkt in jeder Kachel
- Pages koennen direkt in der Leiste erstellt werden
- Kalender-Widget und Pomodoro-Widget
- Lokaler "Frei von League"-Zaehler unter Pomodoro

## Installation (temporar)

1. Firefox oeffnen.
2. `about:debugging#/runtime/this-firefox` aufrufen.
3. Auf `Temporare Add-ons laden...` klicken.
4. Die Datei `manifest.json` in diesem Ordner auswaehlen.

## Nutzung

1. Einen neuen Tab oeffnen -> die eigene Startseite erscheint.
2. Kachel verschieben: Kachel kurz gedrueckt halten und dann ziehen.
3. In jeder Kachel:
	- `+` fuegt einen Link hinzu
	- `...` oeffnet Kachel-Einstellungen (Name, Groesse, Darstellung, Loeschen)
	- bei jedem Link oeffnet `⋮` das Link-Menue (Bearbeiten/Umbenennen/URL/Loeschen)
4. Auf freie Flaeche klicken -> neue Kachel an der Position erstellen.
5. Wallpaper oben rechts mit `Wallpaper` hochladen oder mit `Clear` entfernen.

Hinweis: Der separate Layout-Bearbeiten-Modus wurde entfernt. Alles ist direkt auf der Startseite bearbeitbar.

## Damit es beim Firefox-Start angezeigt wird

Firefox kann beim Start auch letzte Tabs/Fenster wiederherstellen. Dann siehst du nicht automatisch die Startseite.

Stelle deshalb in Firefox ein:

1. `Einstellungen -> Allgemein -> Start`.
2. Bei `Beim Start von Firefox` die Option `Startseite anzeigen` auswaehlen (nicht `Fenster und Tabs der letzten Sitzung anzeigen`).
3. Unter `Startseite und neue Fenster` sollte die Erweiterung als Startseite aktiv sein.

## Hinweis

Die temporare Installation bleibt nur bis zum naechsten Firefox-Neustart aktiv.

## Frei von League

Unter Pomodoro zeigt der Zaehler Tage und Stunden seit deiner letzten League-Partie.
Beim ersten Oeffnen startet er bei null. Der Zeitpunkt wird lokal gespeichert: Neue
Tabs, ein Firefox-Neustart oder ein ausgeschalteter Rechner setzen ihn nicht zurueck.
Das gilt bei dauerhaft installierter Erweiterung; bei einer temporaeren Installation
muss die Erweiterung nach einem Firefox-Neustart erneut geladen werden.

- Unter **Startdatum aendern** kannst du das Datum und die Uhrzeit deiner letzten Partie setzen.
- Nach einer Partie aktualisierst du den Zaehler selbst; Spiele werden nicht automatisch erkannt.

Der Zaehler arbeitet ausschliesslich lokal. Er speichert nur den Startzeitpunkt
und synchronisiert Aenderungen zwischen offenen New-Tab-Seiten. Fuer dieses Widget
werden keine Netzwerkabfragen ausgefuehrt. Alte Verbindungsdaten werden beim Laden
der aktualisierten Erweiterung entfernt.

Nach einer Code-Aenderung die Erweiterung unter `about:debugging#/runtime/this-firefox`
**neu laden**, damit die Aenderungen und die Bereinigung gespeicherter Daten aktiv werden.

### Pruefungen

Mit Node.js (ohne weitere Pakete): `node --test tests/league-background.test.cjs tests/league-timer.test.cjs`
Die Tests pruefen gespeicherte Zeitpunkte, mehrere Tabs, die Umstellung alter
Daten und die manuelle Bedienung des Zaehlers.
