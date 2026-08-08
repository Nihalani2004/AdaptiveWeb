# Testing Procedures

## Functional Testing

### Feature 1: Hover Dwell
- **Action**: Hover over a paragraph (>50px size) for 1.5 seconds.
- **Expected**: A yellow highlight appears.
- **Verification**: Check `injected.css` class `.aw-highlighted` is applied.

### Feature 2: Scroll-Back Summary
- **Action**: On a page or nested panel with at least 480 px of scrollable range, scroll quickly past 85% depth and return above 20% depth within 18 seconds.
- **Expected**: A visible, pinned summary box appears with the maximum depth, three takeaways, and a `Gemini summary` or `Local summary` source badge.
- **Verification**: Check `.aw-summary-box.aw-visible` exists, computed opacity is `1`, and the content came from text visited during the gesture. The `Read from start` action should return the correct page or nested panel to its beginning.
- **False-positive checks**: A shallow return, a slow deep read, text selection, active media, a hidden tab, and repeated attempts during cooldown must not show another summary.
- **Fallback**: Stop the backend and repeat the gesture. The loading state must resolve to a clearly labeled `Local summary` without breaking the page.
- **Limits**: At most two automatic summaries are shown per tab session, with a two-minute cooldown per scroll source.

### Feature 3: Rapid Skimming
- **Action**: Scroll quickly (3+ fast samples) through a long page or the Demo panel, then stop scrolling for about one second. Do not scroll back to the top.
- **Expected in Ask mode**: A compact-reading prompt appears with `Compact view`, `Always on this site`, and `Not now`.
- **Expected in Automatic mode**: Compact reading activates after the idle delay without another prompt.
- **Verification**: Key-point elements use `.aw-tldr-preview`; preserved original paragraphs have `.aw-tldr-collapsed.aw-tldr-original-hidden`; each paragraph has an accessible `.aw-tldr-read-more` control.
- **Controls**: Verify individual expansion, `Expand all`, `Key points only`, Ask/Automatic switching, `Disable for this tab`, and `Exit compact view` all preserve or fully restore the original DOM content.
- **Independence**: Rapid skim alone must offer TL;DR mode. A deep scroll-back must still show its summary but must not activate TL;DR by itself.
- **Safety checks**: Introductory content, forms, navigation, tables, alerts, editable content and short paragraphs should not be condensed. Dynamically added long paragraphs should be processed once while the mode is active.
- **Accessibility checks**: Verify `aria-expanded`, `aria-controls`, keyboard focus, Escape dismissal of the prompt and reduced-motion styling.

### Feature 4: Cursor Hesitation
- **Stationary action**: Move onto a button, link, choice, or form field and pause for roughly 2–3 seconds.
- **Searching motion**: Move in a circle or repeated zig-zag within one page region.
- **Choice oscillation**: Move between two nearby controls at least three times.
- **Dead click**: Click a non-responsive interactive-looking control twice within five seconds.
- **Form difficulty**: Attempt to submit a form with a missing or invalid required field.
- **Expected**: An accessible contextual assistant appears near the cursor with `AI Suggestions` and a safe local-help action.
- **Verification**: Check for `.aw-suggestion-bubble.aw-visible`; verify computed opacity is `1`, Escape dismisses the assistant, and analytics contain aggregate pattern metadata without raw `x`/`y` coordinates.
- **False-positive checks**: Idling over plain reading text, typing, selecting text, playing media, or interacting with an existing AdaptiveWeb overlay should not show the assistant.

### Enhanced Cursor Assistance

1. **AI grounding**: Select `AI Suggestions`. The result should show a `Gemini suggestions` badge, one explanation, and up to three action cards tied to nearby page controls.
2. **Guided actions**: Select a `Show me` action. The matching control should scroll into view and highlight; form fields should receive focus without any value being entered.
3. **Safe activation**: An activatable link or ordinary button must show a second confirmation panel. The control must not activate before `Confirm action` is selected.
4. **Sensitive-action protection**: Purchase, payment, submit, delete, send, publish, account, password, and payment-form controls must only highlight and must never offer executable confirmation.
5. **Form coaching**: Trigger form difficulty with required or invalid fields. Local help should list the field-specific validation reason and provide `Go to...` actions.
6. **Choice comparison**: Oscillate between nearby choices. Local help should show each option's selected/disabled state and any short local description or price metadata.
7. **Dead-click diagnosis**: Repeatedly click an unresponsive control. Local help should identify disabled, busy, covered, unusable-link, pointer-blocked, or incomplete-form conditions when observable.
8. **Fallback labeling**: Stop the backend and request AI help. The panel should switch to a clearly labeled `Local fallback` instead of presenting generic text as Gemini output.
9. **Feedback**: Select `Yes` or `Not really`. The buttons should disable after one response and aggregate feedback should be stored under `aw-cursor-help-feedback-v1`.
10. **Privacy text**: The hesitation bubble must state that pointer patterns stay on-device and redacted page context is sent only after choosing AI help.

## Troubleshooting
- **Extension not working?**: Check `chrome://extensions` for errors. Ensure "Reload" is clicked after code changes.
- **No Styles?**: Ensure `injected.css` is loaded (Network tab).
