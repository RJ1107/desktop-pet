# Desktop Pet

[![check](https://github.com/RJ1107/desktop-pet/actions/workflows/check.yml/badge.svg)](https://github.com/RJ1107/desktop-pet/actions/workflows/check.yml)

![A realistic cat on the desktop: walking, eating from the bowl, head-bunting a hand, rolling over, stretching up the wall](docs/demo.webp)

[Full video (MP4, 50 s)](docs/demo.mp4) · **[Download for Windows or macOS](https://github.com/RJ1107/desktop-pet/releases/latest)**

A cat or dog that lives on your desktop and looks like your own pet. Give it one to three photos: an image model paints it, a video model films its motions, and the app cuts them out of their green screen and plays them on top of your desktop. It walks about, sits, loafs, naps, stretches, washes, rolls over and stretches up the side of the screen; you can feed it kibble, treats and water, it head-bunts your hand, and you can talk to it by text or voice. It has a personality you can edit and remembers what you tell it. The cat in the video is the author's own.

Windows and macOS. You bring your own API key; a full set of 18 motions costs about US$2.20.

## Getting started

### 1. Install

**The easy way: download the installer** from the [latest release](https://github.com/RJ1107/desktop-pet/releases/latest).

- **Windows:** `Desktop-Pet-Setup-<version>.exe`. Run it: it installs for you alone and starts. If Windows says "Windows protected your PC" (the installer is not signed with a paid certificate), click **More info → Run anyway**.
- **macOS:** `Desktop-Pet-<version>-arm64.dmg` for Apple silicon (M1 and later), `…-x64.dmg` for Intel Macs. Open it and drag Desktop Pet into Applications. The app is not notarised by Apple, so the first time right-click it and choose **Open**, or allow it under **System Settings → Privacy & Security → Open Anyway**. If macOS still says the app is damaged or cannot be opened, run `xattr -cr "/Applications/Desktop Pet.app"` in Terminal once and open it again.

**Or run it from the source** (for developers): see [Running from the source](#running-from-the-source) below.

You also need **an API key** for the AI models. The default service is [OpenRouter](https://openrouter.ai): one account reaches every model used here. Add a few dollars of credit (one pet costs about $2–3) and create a key. Any OpenAI-compatible service works too.

### 2. First start

On first start a simple drawn stand-in appears on the desktop and the settings window opens. The app's icon is in the system tray (bottom right on Windows, the menu bar on macOS). The interface follows your system language: Chinese or English.

### 3. Add your key

Settings → **Talk & voice** → **Connection**: paste the key, click **Save settings**, then **Test: say hello**. A reply means you are connected. The key is encrypted by the operating system (DPAPI on Windows, the Keychain on macOS) and stays on your computer.

### 4. Make your pet (the **Look** tab, three steps)

1. **Who it is** (free): name, cat or dog, breed (26 cat and 17 dog breeds), sex, weight, coat and eye colour. The weight sets how large it is on screen.
2. **Photos and what makes it yours** (free; reading the photos costs under a cent): one to three clear photos, ideally full body from the side, plus anything special in your own words ("long tufts on the ear tips", "a white left front paw"). **Read breed and colours from the photos** fills in step 1 for you.
3. **Generate the realistic look** (the only step that costs money):
   - **Paint the portrait** (about $0.05, a minute): a realistic side view of your pet in front of a green screen. Paint another if you don't like it.
   - **Film the motions** (all 18 for about $2.20, a few minutes): the button says how many are missing and roughly what they will cost. When they arrive the app cuts them out, and the stand-in on your desktop becomes your pet.
   - If one motion comes out badly, click its chip twice to film just that one again (about $0.12).

To keep several pets: **My pets** at the top of the Look tab → **+ Add a pet**. Each has its own look, motions, photos, bowls, memories and conversation.

### 5. Playing with it

| Do this | It does this |
| --- | --- |
| Rest the cursor on it | The cursor becomes a hand; its name and needs (food, water, energy, mood) appear |
| Keep your hand by its head for two seconds | It turns and rubs its forehead against your hand |
| Rub the cursor back and forth on it | You pet it; keep going and it rolls over |
| Click | Wakes it or gets it up when it is resting; otherwise opens the menu |
| Right-click | Menu: kibble, treat, water, chat, nap; then settings, hide, quit |
| Drag | Pick it up; let go and it drops back down |
| Double-click | Chat. ✕ or Esc closes the chat box |
| Tray icon | Click to chat, right-click for the menu |

Clicks anywhere else go straight through to the windows underneath. The sides of the screen are solid walls: its nose and tail never leave the screen.

## How it works: the models and what each one does

| Step | What happens | Default model | Where | Rough cost |
| --- | --- | --- | --- | --- |
| Read the photos (optional) | Suggests breed, weight and colours | Gemini 3.8 Flash | cloud | under 1¢ |
| Paint the portrait | Photos + breed, weight, colours + your words → one realistic side view on a green screen | Nano Banana 2.1 (Google image model) | cloud | ~$0.05 |
| Film the motions | The portrait as first and last frame + a description of one motion → a 4-second clip, one per motion | Veo 3.1 Lite (Google video model) | cloud | ~$0.12 a clip |
| Cut out and measure | Removes the green screen; finds loop points, the mouth, the body's width | no model: the app's own code | your computer | free |
| Chat | Answers in character, from its personality, needs and memories | Claude Haiku 5.5 | cloud | under 1¢ a reply |
| Voice in | Writes down what you say | Gemini 3.8 Flash | cloud | under 1¢ |
| Voice out | Your computer's own voices; a speech service optionally | system / ElevenLabs | local / cloud | free / per use |

- **The motions are not filmed from your photos directly.** The image model first paints one portrait: the same animal, side on, on plain green. Every motion is filmed from that one picture, so all 18 clips show the same pet at the same size and spot.
- **Every clip starts and ends on that portrait**, so any clip can follow any other without a visible jump (an idea borrowed from the open-source project dsh-pet).
- **Cutting out** means removing the green background so only the animal is left, as with a film's green screen. Each pixel's transparency follows how strongly green it is, so fur keeps soft edges; only green connected to the frame's edge is removed, so green eyes stay; crumbs the video model invents on the floor are cleaned away.
- **Measuring**: which two frames of a walk match well enough to loop, where the mouth is so it lines up with the bowl, how wide the body is so it stops at the walls, and which frame of a rest is calmest with the eyes open, so it can hold still on it.
- Every model can be changed under **Talk & voice → Advanced: choose other models**.

## macOS

The same code runs on Windows and macOS (Electron). The transparent always-on-top window, click-through, menu-bar icon, Keychain storage and microphone permission all take the macOS route there.

**Daily use has only been tried on Windows 11.** GitHub Actions runs both test suites on Windows and macOS for every push, including the one that starts the real app; see the badge on the Actions tab. Multiple desktops (Spaces) and full-screen apps on macOS have not been tried by a person yet. Issues are welcome.

## Your data

- Pets, photos and filmed motions stay on your computer:
  - Windows: `%APPDATA%\desktop-pet`
  - macOS: `~/Library/Application Support/desktop-pet`
- Photos and text leave it only when you generate a look, chat or use voice input, and only to the model service on your own account.
- Before the first save each day, the pet data is copied to `backups/` in that folder; the last 14 days are kept.

## More details

- **On its own** (by chance, not every time):
  - after a nap it may stretch, walk to a side of the screen and stretch up the wall, or wash;
  - after sitting a while it often washes;
  - now and then it yawns, mews softly or rolls over;
  - very hungry, it meows loudly; very tired, it yawns before it naps.
  - It never jumps of its own accord, only when asked.
- **Meals:** put food down and it comes, getting up first if it was asleep. Kibble sits in the bowl piece by piece, three pieces to a bite; the water level drops as it drinks. It gets hungry while the app is closed, but never starves. You can replace the bowls with your own from photos (about $0.05 each).
- **Playback:**
  - Standing plays forwards then backwards.
  - Sitting and sleeping settle into the calmest half second and only breathe.
  - Walking repeats its best-matching stretch a whole number of times, so the feet stop exactly on arrival.
  - Stretches and the roll change speed through the motion, blending neighbouring frames where slowed.
  - Turning round cross-fades instead of flipping.
- **Talking:**
  - The personality is a Markdown file; a cat and a dog one are built in (`personalities/`), and you can point it at your own.
  - It keeps memories, which you can review and delete on the Memory tab.
  - It acts on "jump", "come here", "stretch", "roll over", "rub my hand".
  - Rename it in the Look tab, or just tell it its new name.

## Running from the source

Needs Node.js 22 or newer.

```bash
git clone https://github.com/RJ1107/desktop-pet.git
```

```bash
cd desktop-pet
```

```bash
npm install
```

```bash
npm start
```

`npm install` also downloads Electron, the runtime that turns the app into a desktop program (about 100 MB). To start it with a double-click from then on, run `node scripts/make-shortcut.mjs` once: on Windows it puts a paw-icon shortcut on the desktop, on macOS a `.command` file. `npm run dist` builds the installer for the system you are on (into `dist/`); pushing a version tag builds both on GitHub Actions and attaches them to a release.

## Development

```
src/main/        main process: windows, tray, storage, model calls, look generation, bowls
src/renderer/    the pet window and the settings window
src/renderer/pet behaviour (brain.js), footage playback (real.js), the drawn stand-in (rig.js)
src/shared/      pure logic: needs, breeds, cut-out, playback rules, memory, prompts
personalities/   built-in personalities
scripts/         desktop shortcuts, the live board
test/            tests and tools
docs/            the demo
```

```bash
npm test
```

40 logic tests, no window needed.

```bash
npm run check
```

Starts the real app and walks through 18 steps: adopting, photos, the key, feeding, dragging, chat, voice, generating and playing the realistic look, bowls, several pets, renaming, and a restart. A local stand-in plays the model service, so it needs no key and spends nothing.

Tools in `test/`:
- `record-demo.cjs` records the demo above, on a copy of your data;
- `ui-shots.cjs` takes a picture of every screen;
- `real-cut.cjs` re-cuts downloaded clips.

These three cost nothing. `real-probe.cjs`, `real-bowl.cjs` and `real-chat.cjs` call real models and refuse to run without `--spend`.

Development was tracked on a local live board (`node scripts/open-board.mjs`; the board itself is [ai-coding-kanban](https://github.com/RJ1107/ai-coding-kanban)).

## Known limits

- The video model does not always get complex motions right. Clips that come out badly can be filmed again one at a time. With Gigi:
  - the wall stretch leans at about 60° instead of standing straight against the wall;
  - from the side, two front legs stretched side by side read as one;
  - the loaf often came out as sitting up.
- Only the author has watched it in motion. Dogs, macOS in daily use and multiple monitors have not been tried by a person.
- Bowls from photos have been checked with the stand-in model only: with the author's account the default image service answered "quota exceeded" each time it was tried. If it does that for you, try again later or pick another image model.
- Memory use is on the high side: about 700 MB at rest.
- The installers are not signed with a paid certificate, so Windows and macOS each ask once whether to trust the app.

## License

[MIT](LICENSE)
