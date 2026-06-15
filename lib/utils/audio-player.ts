/**
 * Audio Player - Audio player interface
 *
 * Handles audio playback, pause, stop, and other operations
 * Loads pre-generated TTS audio files from IndexedDB
 *
 */

import { db } from '@/lib/utils/database';
import { createLogger } from '@/lib/logger';

const log = createLogger('AudioPlayer');

/**
 * Audio player implementation
 */
export class AudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private activeBlobUrl: string | null = null;
  private onEndedCallback: (() => void) | null = null;
  private muted: boolean = false;
  private volume: number = 1;
  private playbackRate: number = 1;
  private preloadedSourcePromises: Map<string, Promise<string | null>> = new Map();
  private preloadedSourceUrls: Set<string> = new Set();

  /**
   * Play audio (from URL or IndexedDB pre-generated cache)
   * @param audioId Audio ID
   * @param audioUrl Optional server-generated audio URL (takes priority over IndexedDB)
   * @returns true if audio started playing, false if no audio (TTS disabled or not generated)
   */
  public async play(audioId: string, audioUrl?: string): Promise<boolean> {
    try {
      const preloadKey = this.buildPreloadKey(audioId, audioUrl);
      const preloadedSrc = await this.consumePreloadedSrc(preloadKey);
      if (preloadedSrc) {
        this.stop();
        this.audio = new Audio();
        this.audio.src = preloadedSrc;
        this.activeBlobUrl = preloadedSrc.startsWith('blob:') ? preloadedSrc : null;
        if (this.muted) this.audio.volume = 0;
        else this.audio.volume = this.volume;
        this.audio.defaultPlaybackRate = this.playbackRate;
        this.audio.playbackRate = this.playbackRate;
        this.audio.addEventListener('ended', () => {
          this.onEndedCallback?.();
        });
        await this.audio.play();
        this.audio.playbackRate = this.playbackRate;
        return true;
      }

      // 1. Try audioUrl first (server-generated TTS)
      if (audioUrl) {
        this.stop();
        this.audio = new Audio();
        this.audio.src = audioUrl;
        this.activeBlobUrl = null;
        if (this.muted) this.audio.volume = 0;
        else this.audio.volume = this.volume;
        this.audio.defaultPlaybackRate = this.playbackRate;
        this.audio.playbackRate = this.playbackRate;
        this.audio.addEventListener('ended', () => {
          this.onEndedCallback?.();
        });
        await this.audio.play();
        this.audio.playbackRate = this.playbackRate;
        return true;
      }

      // 2. Fall back to IndexedDB (client-generated TTS)
      const audioRecord = await db.audioFiles.get(audioId);

      if (!audioRecord) {
        // Pre-generated audio does not exist (generation failed), skip silently
        return false;
      }

      // Stop current playback
      this.stop();

      // Create audio element
      this.audio = new Audio();

      // Set audio source
      const blobUrl = URL.createObjectURL(audioRecord.blob);
      this.audio.src = blobUrl;
      this.activeBlobUrl = blobUrl;
      if (this.muted) this.audio.volume = 0;
      else this.audio.volume = this.volume;

      // Apply playback rate
      this.audio.defaultPlaybackRate = this.playbackRate;
      this.audio.playbackRate = this.playbackRate;

      // Set ended callback
      this.audio.addEventListener('ended', () => {
        if (this.activeBlobUrl) {
          URL.revokeObjectURL(this.activeBlobUrl);
          this.activeBlobUrl = null;
        }
        this.onEndedCallback?.();
      });

      // Play
      await this.audio.play();
      // Re-apply after play() — some browsers reset during load
      this.audio.playbackRate = this.playbackRate;
      return true;
    } catch (error) {
      log.error('Failed to play audio:', error);
      throw error;
    }
  }

  /**
   * Pause playback
   */
  public pause(): void {
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
    }
  }

  /**
   * Stop playback
   */
  public stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio = null;
    }
    if (this.activeBlobUrl) {
      URL.revokeObjectURL(this.activeBlobUrl);
      this.activeBlobUrl = null;
    }
    // Note: onEndedCallback intentionally NOT cleared here because play()
    // calls stop() internally — clearing would break the callback chain.
    // Stale callbacks are harmless: engine mode check prevents processNext().
  }

  /**
   * Resume playback
   */
  public resume(): void {
    if (this.audio?.paused) {
      this.audio.playbackRate = this.playbackRate;
      this.audio.play().catch((error) => {
        log.error('Failed to resume audio:', error);
      });
    }
  }

  /**
   * Get current playback status (actively playing, not paused)
   */
  public isPlaying(): boolean {
    return this.audio !== null && !this.audio.paused;
  }

  /**
   * Whether there is active audio (playing or paused, but not ended)
   * Used to decide whether to resume playback or skip to the next line
   */
  public hasActiveAudio(): boolean {
    return this.audio !== null;
  }

  /**
   * Get current playback time (milliseconds)
   */
  public getCurrentTime(): number {
    return this.audio ? this.audio.currentTime * 1000 : 0;
  }

  /**
   * Get audio duration (milliseconds)
   */
  public getDuration(): number {
    return this.audio && !isNaN(this.audio.duration) ? this.audio.duration * 1000 : 0;
  }

  /**
   * Set playback ended callback
   */
  public onEnded(callback: () => void): void {
    this.onEndedCallback = callback;
  }

  /**
   * Set mute state (takes effect immediately on currently playing audio)
   */
  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.audio) {
      this.audio.volume = muted ? 0 : this.volume;
    }
  }

  /**
   * Set volume (0-1)
   */
  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.audio && !this.muted) {
      this.audio.volume = this.volume;
    }
  }

  /**
   * Set playback speed (takes effect immediately on currently playing audio)
   */
  public setPlaybackRate(rate: number): void {
    this.playbackRate = Math.max(0.5, Math.min(2, rate));
    if (this.audio) {
      this.audio.playbackRate = this.playbackRate;
    }
  }

  /**
   * Destroy the player
   */
  public destroy(): void {
    this.stop();
    this.clearPreloadedSources();
    this.onEndedCallback = null;
  }

  /**
   * Preload upcoming audio so consecutive clips can start faster.
   * Best-effort only; failures fall back to normal play().
   */
  public preload(audioId: string, audioUrl?: string): void {
    const key = this.buildPreloadKey(audioId, audioUrl);
    if (!key || this.preloadedSourcePromises.has(key)) return;
    const task = this.resolvePreloadSrc(audioId, audioUrl)
      .then((src) => {
        if (src) this.preloadedSourceUrls.add(src);
        return src;
      })
      .catch(() => null);
    this.preloadedSourcePromises.set(key, task);
  }

  private buildPreloadKey(audioId: string, audioUrl?: string): string | null {
    if (audioUrl && audioUrl.trim().length > 0) return `url:${audioUrl}`;
    if (audioId && audioId.trim().length > 0) return `id:${audioId}`;
    return null;
  }

  private async consumePreloadedSrc(key: string | null): Promise<string | null> {
    if (!key) return null;
    const task = this.preloadedSourcePromises.get(key);
    if (!task) return null;
    this.preloadedSourcePromises.delete(key);
    const src = await task;
    if (src) this.preloadedSourceUrls.delete(src);
    return src;
  }

  private async resolvePreloadSrc(audioId: string, audioUrl?: string): Promise<string | null> {
    if (audioUrl && audioUrl.trim().length > 0) {
      if (audioUrl.startsWith('data:')) return audioUrl;
      const response = await fetch(audioUrl, { cache: 'force-cache' });
      if (!response.ok) return null;
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    }
    if (audioId && audioId.trim().length > 0) {
      const audioRecord = await db.audioFiles.get(audioId);
      if (!audioRecord) return null;
      return URL.createObjectURL(audioRecord.blob);
    }
    return null;
  }

  private clearPreloadedSources(): void {
    for (const pending of this.preloadedSourcePromises.values()) {
      void pending.then((src) => {
        if (src?.startsWith('blob:')) {
          URL.revokeObjectURL(src);
        }
      });
    }
    this.preloadedSourcePromises.clear();
    for (const src of this.preloadedSourceUrls) {
      if (src.startsWith('blob:')) {
        URL.revokeObjectURL(src);
      }
    }
    this.preloadedSourceUrls.clear();
  }
}

/**
 * Create an audio player instance
 */
export function createAudioPlayer(): AudioPlayer {
  return new AudioPlayer();
}
