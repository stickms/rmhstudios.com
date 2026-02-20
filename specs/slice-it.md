Slice-It Updates:

Revamp the entire beatmap generation system to be more dynamic based on the song:
 - Always, always keep it deterministic
 - Parse the song file directly (this can be done on the server when a user uploads a song)
 - The beatmap should be generated based on the song's BPM, key, and based on the actual waveform:
    - "hits" should be placed at the start of drum beats or main melodic elements or distinct, quick notes
    - "long notes" should be placed on sustained notes
 - The beatmap should be generated in a way that is challenging but fair
 - The beatmap should be generated in a way that is fun to play
 - The beatmap should be generated in a way that is visually appealing
 - The beatmap should be generated in a way that is replayable
 