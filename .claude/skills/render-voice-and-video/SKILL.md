---
name: render-voice-and-video
description: The offline free-GPU pipeline that produces the agent's voice and video artifacts — recording the source footage, cloning the voice with Chatterbox on Colab, encoding for web, and committing the results. Use when new video clips or voice assets are needed, when a project write-up changed and its clip is stale, when re-recording the reference audio, or when the voice clone needs regenerating. Triggers on "render the video", "record the clips", "regenerate the voice", "new project clip".
allowed-tools: Bash(ffmpeg *), Bash(node scripts/*), Bash(git *), Read, Write, Edit
---

# Render voice and video artifacts

**This procedure is written for someone who has forgotten everything.** That is probably
you. Follow it top to bottom; do not improvise a notebook.

Everything here happens **offline**, on a laptop or a free Colab T4. Nothing in this
pipeline runs at request time. The outputs are static files committed to `public/media/`
and served from Cloudflare's CDN at zero marginal cost. **That is the entire cost
strategy of the project** — if you find yourself about to call a model at request time to
produce audio or video, you have taken a wrong turn.

---

## Part A — Record the source footage (phone, ~2 hours)

Do this once. Re-record only when the talk track genuinely changes.

### Setup

| Thing | Requirement | Why |
|---|---|---|
| Camera | Phone, rear camera (better sensor), 1080p 30fps | Front camera looks soft at 720p |
| Framing | Head and shoulders, eyes on the **upper third** line, camera at eye level | Camera below eye level is unflattering and reads as amateur |
| Distance | ~70cm, phone propped, **not handheld** | Handheld shake is the single most obvious tell |
| Light | Window in front of him, no window behind | Backlight makes a silhouette |
| Background | Plain wall, some depth. No bed, no clutter | |
| Audio | **Quiet room.** No fan, no AC, no traffic, no laptop fan | Audio quality dominates perceived production value far more than video does |
| Wardrobe | Plain solid colour, no fine stripes or checks | Fine patterns alias badly under video compression |

### Clips to record

| File | Length | Content | Notes |
|---|---|---|---|
| `idle-raw.mov` | 20s | Looking at camera, small natural movement, **no speech**, relaxed neutral-positive face | Will be cut to a seamless ~8s loop. Do not hold still — a frozen face is uncanny. Blink normally. |
| `listening-raw.mov` | 15s | Attentive, slight nod once or twice, no speech | v1 only |
| `intro-raw.mov` | ~25s | The intro script (below) | **Two takes maximum. Ship the second.** See risk R12 — perfectionism here has eaten weekends before. |
| `proj-<id>-raw.mov` | ~30s each | One per project, from that project's `talk_track` field | v1. Three clips. |
| `reference-audio.wav` | 60–120s | Reading anything neutral, natural pace | **This one file determines voice clone quality more than the model choice does.** Read a Wikipedia article. Do not perform. |

### The intro script (v0)

Keep it under 25 seconds spoken. Verify every claim against
`content/content.snapshot.json` before recording — **a recorded video bypasses the
grounding verifier entirely**, so it is the one place a false claim could reach a
recruiter unchecked. Read it against the snapshot line by line.

> "Hey — I'm Kshitij. I'm a backend engineer: async pipelines, task queues, retrieval
> systems. I interned at Zhecker building Celery workers that processed exam uploads at
> peak load, and I've shipped three things I actually run in production — a document
> pipeline with hybrid retrieval, an autonomous research engine, and an expense-splitting
> app. This page is an AI version of me, and it runs at zero cost per month. Ask it
> anything about my work — and if it doesn't know, it'll tell you to email me."

The last clause is deliberate. It sets the recruiter's expectation for the refusal path
before they hit it, which turns a limitation into a demonstration of care.

### Extract the reference audio

```bash
ffmpeg -i reference-audio.wav -ar 22050 -ac 1 -af "loudnorm=I=-16:TP=-1.5:LRA=11" \
  -c:a pcm_s16le assets/voice/reference.wav
```

**Do not commit `assets/voice/reference.wav` to the public repo.** It is `.gitignore`d.
A clean 90-second sample of his voice is exactly what someone would need to clone him,
and publishing it in a repo he is advertising to strangers would be careless.

---

## Part B — Encode for web (~30 min)

Budgets from PRD §11.2. The build fails if these are exceeded, so check before committing.

### Idle loop — must be seamless

Find a start and end frame with the same head position (scrub the footage; ~8s apart).

```bash
# Cut
ffmpeg -i idle-raw.mov -ss 00:00:04.0 -t 8 -an -c:v libvpx-vp9 -crf 34 -b:v 0 \
  -vf "scale=720:-2,fps=24" public/media/idle.webm

# MP4 fallback for Safari
ffmpeg -i idle-raw.mov -ss 00:00:04.0 -t 8 -an -c:v libx264 -crf 26 -preset slow \
  -vf "scale=720:-2,fps=24" -movflags +faststart public/media/idle.mp4
```

`-an` strips audio — the idle loop must be silent. Target **≤400 KB**. If it is bigger,
raise `-crf` (34 → 38) before shortening the loop; a short loop reads as a twitch.

Check the seam: play it three times in a row in a browser. If the cut is visible, pick
different frames. This is worth 10 minutes and not worth an hour.

### Intro clip

```bash
ffmpeg -i intro-raw.mov -c:v libx264 -crf 26 -preset slow -vf "scale=720:-2,fps=24" \
  -c:a aac -b:a 96k -ac 1 -af "loudnorm=I=-16:TP=-1.5:LRA=11" \
  -movflags +faststart public/media/intro.mp4
```

`-movflags +faststart` is **not optional** — without it the metadata sits at the end of
the file and the video will not start playing until it has fully downloaded. On a
recruiter's 4G connection that is the difference between 1 second and 12.

Target **≤1.2 MB**. Check: `ls -la public/media/`. Over budget → raise `-crf` to 28, then
30. Do not go past 30; artifacts on a face are very visible.

### Captions — by hand

```bash
# Rough draft only:
ffmpeg -i public/media/intro.mp4 -ar 16000 -ac 1 /tmp/intro.wav
# → upload to Groq whisper-large-v3-turbo for a first pass, then CORRECT IT BY HAND.
```

**Hand-correct every caption.** Auto-captions get names and technical terms wrong
("Kshitij", "Celery", "ChromaDB", "Zhecker"), and an avatar mis-captioning its own
scripted speech is exactly the detail an engineering director notices. Write
`public/media/intro.vtt` with ≤2 lines per cue, ~3 seconds per cue.

### Poster

```bash
ffmpeg -i public/media/intro.mp4 -ss 00:00:01.5 -vframes 1 -vf "scale=720:-2" /tmp/poster.png
ffmpeg -i /tmp/poster.png -c:v libwebp -quality 82 public/media/poster.webp
```

Pick a frame where his eyes are open and his mouth is closed or nearly so. This image is
the first thing a recruiter sees and it is the entire visual impression until they tap
Start. Target **≤40 KB**.

---

## Part C — Voice clone (Colab T4, free, ~45 min) — v1 only

**Skip this entirely for v0.** v0 uses his recorded voice and nothing else.

### The model, and why

**Chatterbox** (Resemble AI) — **MIT licensed**, zero-shot cloning from ~5 seconds of
reference audio, actively maintained, and it embeds PerTh watermarking on every
generation. Keep the watermark. For a project that clones a real person's voice, a
built-in provenance marker is an asset, not a nuisance.

**Do not substitute these, and here is why so nobody re-litigates it:**

| Model | Verdict |
|---|---|
| **Coqui XTTS-v2** | ❌ CPML, non-commercial. Coqui Inc. shut down January 2024, so **no entity exists to sell a commercial licence** — the restriction is permanent, not negotiable. |
| **F5-TTS** | ❌ CC-BY-NC-4.0. Non-commercial. |
| **Piper** | ❌ MIT, but needs a *trained* voice, not zero-shot. Wrong tool. |
| **Kokoro** | ⚠️ Apache-2.0 but cannot clone — fixed voices only. Kept as the fallback for a **clearly-labelled generic** narrator if Chatterbox breaks. Never present a Kokoro voice as his. |
| **OpenVoice V2** | ✅ Also MIT (relicensed April 2024). The documented backup. Switch to it if Chatterbox quality disappoints. |
| **ElevenLabs and every hosted cloning service** | ❌ Paid. Out by constraint. |

*(Licences verified 2026-09-06. Re-verify before trusting this table in six months.)*

### The notebook

`notebooks/render_voice.ipynb`. Open in Colab, `Runtime → Change runtime type → T4 GPU`.

Free Colab gives a T4 (16GB), 12-hour maximum session, ~90-minute idle disconnect, and an
**undisclosed** weekly GPU allowance. If the GPU is refused, either wait a few hours or
run on CPU — this is offline batch work, so a slow render is an inconvenience, not a
blocker.

Cells, in order:

1. **Install.** Pin the version. An unpinned install is how this notebook stops working
   in six months.
2. **Upload `reference.wav`.** Manual upload — the file is not in the repo (Part A).
3. **Load the model**, warm it once on a throwaway sentence.
4. **Render the line bank** from `scripts/voice-lines.json`:

   | Category | Examples |
   |---|---|
   | Greeting fragments | `"Hi {name} from {company}"` for the current outreach batch — the only genuinely per-recruiter audio |
   | Bridge lines | "Good question — here's the short version, it's on screen." / "Let me pull that up." |
   | Refusal line | "That's a good question — I'd rather have Kshitij answer that one directly." |
   | Transitions | "The other thing worth mentioning…" |

5. **Listen to every single one.** Not a sample. Every one. A clone that is 95% good has
   one line that sounds possessed, and that line will be the one a recruiter hears.
6. **Encode and download:**
   ```python
   !ffmpeg -i out.wav -c:a libmp3lame -b:a 64k -ac 1 -ar 22050 out.mp3
   ```
   64 kbps mono is plenty for speech and keeps a 2-second fragment around 16 KB — small
   enough to inline as base64 in a KV token value.

### Output naming — exact, because the code reads these paths

```
public/media/voice/bridge-<slug>.mp3      # committed
public/media/voice/refusal.mp3            # committed
/tmp/greet-<token>.mp3                    # NOT committed — inlined into the KV token
```

Greeting fragments are per-recruiter and are **never committed**. They go straight into
the token payload as base64 (PRD §9.3). Committing them would put recruiter names in a
public repo.

---

## Part D — Commit and verify

```bash
npm run check:budget          # fails if any asset is over budget
ls -la public/media/          # eyeball the sizes
git add public/media/
git commit -m "media: <what changed>

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Then, in a real browser on a real phone:

1. Idle loop plays and the seam is not visible.
2. Intro starts within ~1s of tapping Start (faststart working).
3. Captions are correct, including every proper noun.
4. Poster shows before any media is fetched (check the Network tab — **zero media bytes
   before the tap**).
5. Muting the phone loses nothing.

Update `CHANGE_LOG.md` — new or changed media is user-visible.

---

## Rules

- **Never commit `reference.wav` or any raw footage.** `.gitignore` covers
  `assets/voice/` and `assets/raw/`. The public repo must not contain a clean voice
  sample or unedited video of him.
- **Never strip the PerTh watermark** from Chatterbox output.
- **Never present a synthetic voice as his without saying so.** The Kokoro fallback and
  the browser `speechSynthesis` path are both labelled in the UI as synthetic.
- **Everything here is offline.** No model call at request time, ever.
- **Verify recorded speech against the content snapshot before recording.** A recorded
  claim bypasses every grounding layer in the system.
- Two takes. Ship the second.
