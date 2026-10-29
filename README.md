# Agent Video Editor

Edit presenter-led videos (talking-head intros and long-form tutorials) by letting a coding agent
follow a set of editing skills on your own machine. A small local web app sits on top: you pick the
footage, an edit type and a visual theme, and the app runs the agent, shows its progress and plays
the result.

Everything runs locally. The app listens only on `127.0.0.1`, transcription runs on your machine
unless you allow an upload for a particular edit, and your original footage is never modified.

## How it works

```
Browser (127.0.0.1)  ──►  app/ (one Node.js process)  ──►  agent CLI (Claude Code, Codex or Kimi)
                               │                                  │ follows
                               │ watches and serves               ▼
                               └──────── edit/<project>/  ◄──  skills/ + ffmpeg + Python + Remotion
```

1. **Skills** (`skills/`) are instruction packs that a coding agent reads and follows. They are not
   libraries:
   - `presenter-intro-editor` handles short intros.
   - `presenter-long-form-editor` handles full-length videos.
   Both write a timestamped editorial directive first, then build motion graphics with Remotion, then
   composite and verify the result with ffmpeg.
2. **The app** (`app/`) starts the agent with the right skill and settings, streams its progress, asks
   you its questions, and plays the finished video.
3. **Output** goes to `edit/<project>/` in this folder.

## Setup

You need macOS or Linux (on Windows, use WSL2), and one agent CLI that you are signed in to:
[Claude Code](https://docs.claude.com/en/docs/claude-code), Codex or Kimi.

**The easy way:** open your coding agent in this folder and paste the prompt from
[SETUP_PROMPT.md](SETUP_PROMPT.md). It checks and installs everything below, asks before installing
system software, and gives you the link to the app.

**By hand:**

| Requirement | Notes |
|---|---|
| Node.js 22+ | runs the app |
| Python 3.12 (or 3.11) in `.venv/` | for the skills' scripts: `requests librosa matplotlib pillow numpy playwright`, and `mlx-whisper` (Apple Silicon) or `faster-whisper` for local transcription. Then run `.venv/bin/python -m playwright install chromium`. |
| ffmpeg and ffprobe | on your PATH |
| Third-party skills | `video-use` and the `remotion-*` skills are cloned into `skills/`, not stored here. See step 3 of [SETUP_PROMPT.md](SETUP_PROMPT.md). |
| `.claude/skills` link | for Claude Code: `mkdir -p .claude && ln -s ../skills .claude/skills` |

Then build and start the app:

```sh
cd app
npm ci
npm run build
npm start
```

The server prints a link like `http://127.0.0.1:4317/#/?t=…` and opens it. The `?t=` token is
required; every start creates a new one.

## Using it

1. **Settings:** check that the workspace is this folder, the agent CLI is found, and the Python path
   points to `.venv/bin/python`.
2. **New edit:** choose *Intro* or *Long-form*, pick a theme (each has a 15-second preview), then
   select your final-cut recording and set the options:
   - approval mode;
   - loudness;
   - captions;
   - notes to the editor.
3. **Run:** the agent drafts a directive. Depending on the approval mode, it may stop and ask you to
   approve it, or ask a question. Answer in the app.
4. **Review:** play the result in the app. Files are in `edit/<project>/`.

## Make it yours

The skills are meant to be adapted. The main places to change:

- `skills/*/references/brand-system.md` holds the themes, an optional channel wordmark (none is set
  by default), presenter safe areas, and motion rules.
- `skills/*/references/feedback-log.md` starts empty. When you give the agent feedback on an edit, it
  records the lesson there, and promotes lessons that recur into `brand-system.md`.
- `CLAUDE.md` and `AGENTS.md` hold the workspace rules every agent follows:
  - always use `.venv/bin/python`;
  - never modify original footage;
  - write output only to `edit/`;
  - transcribe locally unless you approve an upload.

## Repository layout

```
app/                 the local web app (see app/README.md)
skills/              the two editing skills; third-party skills are installed here by setup
skills-lock.json     the third-party Remotion skills and their source
CLAUDE.md, AGENTS.md workspace rules for agents
SETUP_PROMPT.md      one prompt that sets everything up
```

`sources/`, `edit/`, `.venv/` and the third-party skills are ignored by git, so your footage and
edits never end up in the repository.

## Third-party skills

These are installed at setup time, from their own repositories:

- [browser-use/video-use](https://github.com/browser-use/video-use), MIT licence.
- [remotion-dev/skills](https://github.com/remotion-dev/skills). Rendering with Remotion is subject
  to the [Remotion licence](https://www.remotion.dev/license), which requires a company licence for
  some commercial use.
