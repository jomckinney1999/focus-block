# The research behind Undercurrent

Undercurrent's job is to make starting deep work easier and staying in it more comfortable, without ever becoming a thing you have to manage. Every default below comes from a finding about attention, music, or how programmers actually work. Where a number is our own design judgment rather than a measured result, it says so.

## What music can and can't do

- **The effect is real but modest, and it varies by person.** A meta-analysis of 97 studies found background music's overall effect on performance is close to zero, with small positive and negative effects depending on task and listener (Kämpfe, Sedlmeier & Renkewitz, 2011). So we don't promise productivity gains. We aim at comfort, mood, and a consistent "start" ritual, and we let each person tune it.
- **Mood and arousal are the mechanism.** The "Mozart effect" disappeared once researchers controlled for mood and arousal: any music people enjoyed produced the same lift (Thompson, Schellenberg & Husain, 2001). Software developers who listened to music they liked reported better mood and quality of work; without music, time-on-task was longest but quality was lowest (Lesiuk, 2005).
- **Flow needs clear goals, immediate feedback, and challenge matched to skill** (Csikszentmihalyi, 1990). Music supplies none of these. What it can do is mask distractions and reduce the friction of beginning. Undercurrent's "music answers your typing" loop is a small, immediate feedback signal that you're working.

## Choosing the music

| Decision | Why |
|---|---|
| **No vocals, ever** | Background speech competes with the phonological loop of working memory; vocal music disrupts more than instrumental (Salamé & Baddeley, 1989). Reading and writing code is verbal work. |
| **Slow tempos: 56–66 bpm** | Fast, loud music impaired reading comprehension; slow, soft music did not (Thompson, Schellenberg & Letnic, 2012). |
| **Predictable structure** | Bach's BWV 846 repeats one arpeggio figure for 32 bars; Ground repeats one bass line. Low surprise means less to attend to. *(Design judgment, consistent with the orienting-response research below.)* |
| **Moderate default volume (60%)** | A moderate level of ambient noise (~70 dB) helped creative thinking more than quiet or loud conditions (Mehta, Zhu & Cheema, 2012). You should be able to stop noticing it. |
| **Brown noise option** | Steady noise improved memory performance for inattentive children while hurting attentive ones (Söderlund, Sikström & Smart, 2007): it suits some people and not others, so it's a choice, not the default. |
| **No binaural beats** | Evidence is mixed and heterogeneous (Garcia-Argibay, Santed & Reales, 2019), and they require headphones. Left out. |

## How the music follows you

The core rule: **nothing changes suddenly.** Abrupt changes in a sound trigger an automatic orienting response and mismatch-negativity, pulling attention toward the sound even when you're absorbed elsewhere (Sokolov, 1963; Näätänen et al., 2007). Every transition is a ramp, linear in decibels, which is close to how loudness is perceived.

| Parameter | Default | Reasoning |
|---|---|---|
| What counts as typing | Edits to the file in front of you, while the editor has focus | Formatters, git, and AI agents editing other files don't count. |
| What counts as presence | Scrolling, cursor moves, switching files or terminals | Developers spend ~58% of their time on program comprehension (Xia et al., 2018). Reading is part of flow, so it keeps the music alive. |
| Thinking-pause threshold | Gaps ≥ 2 s | Writing research treats pauses ≥ 2 s as cognitive planning rather than motor gaps (Medimorec & Risko, 2017). Shorter gaps are ignored. |
| **Soften after** | 60 s until learned, then the 90th percentile of *your* thinking pauses × 1.25, clamped to 30–180 s | The music shouldn't react to ordinary thinking. Learning the threshold per person means 9 out of 10 of your normal pauses never touch the music. *(The 60 s starting value and the percentile are design judgments.)* |
| Soft level | −9 dB over 45 s | Roughly half as loud (~10 dB ≈ half perceived loudness). Slow enough to happen beneath notice. |
| **Let go after** | 5 min with no typing *or* navigation | Long enough to cover reading and thinking, short enough to notice real breaks. *(Design judgment; configurable.)* |
| Fade to silence | 2 min, then the audio engine suspends | Leaving shouldn't feel like being switched off. Suspending saves CPU and pauses sequenced pieces mid-phrase. |
| Coming back from a dip | Any single edit, 2.5 s rise | Typing should feel answered right away. |
| Coming back from silence | 3 edits within 15 s, 6 s rise starting at −30 dB | A stray keypress shouldn't start music. After interruptions, programmers rarely resume editing within a minute (Parnin & Rugaber, 2011), and resuming is the expensive part (Iqbal & Horvitz, 2007; Mark, Gudith & Klocke, 2008). Music that picks up where it left off is a familiar re-entry cue. |
| Hold | "Keep playing" for 15–90 min | For long reading, code review, or design thinking where you won't type. |

## Things we'd like to measure

These are open questions worth testing with real users (opt-in, local telemetry only):

1. Does the learned threshold actually reduce dips during active work compared to a fixed 60 s?
2. Do people resume typing sooner after a break when the music returns, compared with music that simply plays continuously?
3. What's the distribution of preferred soft levels? Is −9 dB too much or too little?
4. Does the "keep playing" hold get used, and does it suggest reading should count fully as flow?

## References

- Csikszentmihalyi, M. (1990). *Flow: The Psychology of Optimal Experience.* Harper & Row.
- Garcia-Argibay, M., Santed, M. A., & Reales, J. M. (2019). Efficacy of binaural auditory beats in cognition, anxiety, and pain perception: a meta-analysis. *Psychological Research, 83*, 357–372.
- Iqbal, S. T., & Horvitz, E. (2007). Disruption and recovery of computing tasks: field study, analysis, and directions. *Proc. CHI 2007.*
- Kämpfe, J., Sedlmeier, P., & Renkewitz, F. (2011). The impact of background music on adult listeners: A meta-analysis. *Psychology of Music, 39*(4), 424–448.
- Lesiuk, T. (2005). The effect of music listening on work performance. *Psychology of Music, 33*(2), 173–191.
- Mark, G., Gudith, D., & Klocke, U. (2008). The cost of interrupted work: more speed and stress. *Proc. CHI 2008.*
- Medimorec, S., & Risko, E. F. (2017). Pauses in written composition: on the importance of where writers pause. *Reading and Writing, 30*, 1267–1285.
- Mehta, R., Zhu, R., & Cheema, A. (2012). Is noise always bad? Exploring the effects of ambient noise on creative cognition. *Journal of Consumer Research, 39*(4), 784–799.
- Näätänen, R., Paavilainen, P., Rinne, T., & Alho, K. (2007). The mismatch negativity (MMN) in basic research of central auditory processing: a review. *Clinical Neurophysiology, 118*(12), 2544–2590.
- Parnin, C., & Rugaber, S. (2011). Resumption strategies for interrupted programming tasks. *Software Quality Journal, 19*(1), 5–34.
- Salamé, P., & Baddeley, A. (1989). Effects of background music on phonological short-term memory. *Quarterly Journal of Experimental Psychology, 41A*(1), 107–122.
- Sokolov, E. N. (1963). *Perception and the Conditioned Reflex.* Pergamon.
- Söderlund, G., Sikström, S., & Smart, A. (2007). Listen to the noise: noise is beneficial for cognitive performance in ADHD. *Journal of Child Psychology and Psychiatry, 48*(8), 840–847.
- Thompson, W. F., Schellenberg, E. G., & Husain, G. (2001). Arousal, mood, and the Mozart effect. *Psychological Science, 12*(3), 248–251.
- Thompson, W. F., Schellenberg, E. G., & Letnic, A. K. (2012). Fast and loud background music disrupts reading comprehension. *Psychology of Music, 40*(6), 700–708.
- Xia, X., Bao, L., Lo, D., Xing, Z., Hassan, A. E., & Li, S. (2018). Measuring program comprehension: A large-scale field study with professionals. *IEEE Transactions on Software Engineering, 44*(10), 951–976.

> Citations were assembled from memory of the literature and should be checked against the originals before they appear in public marketing.
