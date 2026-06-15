# Windows Function Map

This map records binary-level anchors that can be reproduced without assigning
unverified semantic names to every stripped function.

| Area | Evidence | Status |
| --- | --- | --- |
| Entry point | RVA `0x91b0`, image base `0x00400000` | Confirmed |
| Main window | class string `NsShaftClass`, title `NS-SHAFT` | Confirmed |
| Game timing | imports `SetTimer`, `KillTimer`, `GetTickCount` | Confirmed |
| Drawing | imports `CreateDIBSection`, `StretchDIBits`, `BitBlt` | Confirmed |
| Input/focus | message loop plus `GetFocus` | Confirmed |
| MIDI | `mciSendCommandA`, device string `sequencer`, `bgm.mid` | Confirmed |
| Sound effects | `PlaySoundA`, `sndPlaySoundA`, `WAVE` resources | Confirmed |
| Persistence | profile APIs and `NSSHAFT.INI` strings | Confirmed |
| Help | `WinHelpA`, `NSSHAFT.HLP` | Confirmed |

Future dynamic-analysis work should label the timer callback, window procedure,
simulation update, platform generator, collision resolver and score dialogs using
breakpoints on the imported APIs above.

