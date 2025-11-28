import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers"
import type { Embedder, Embedding } from "./types.ts"

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2"
const EMBEDDER_NAME = "minilm-l6-v2"
const DIMENSIONS = 384

/**
 * MiniLM-L6-v2 embedder using Hugging Face Transformers.js.
 * Runs locally on CPU via ONNX runtime.
 */
export class MiniLMEmbedder implements Embedder {
  readonly name = EMBEDDER_NAME
  readonly dimensions = DIMENSIONS

  private pipeline: FeatureExtractionPipeline | null = null
  private initPromise: Promise<void> | null = null

  /**
   * Lazily initialize the pipeline on first use.
   * Downloads the model if not cached.
   */
  private async ensureReady(): Promise<FeatureExtractionPipeline> {
    if (this.pipeline) return this.pipeline

    if (!this.initPromise) {
      this.initPromise = (async () => {
        this.pipeline = await pipeline("feature-extraction", MODEL_NAME, {
          dtype: "fp32",
        })
      })()
    }

    await this.initPromise
    return this.pipeline!
  }

  async embed(text: string): Promise<Embedding> {
    const pipe = await this.ensureReady()

    const output = await pipe(text, {
      pooling: "mean",
      normalize: true,
    })

    // Output is a Tensor — extract as array
    const vector = Array.from(output.data as Float32Array)

    return {
      vector,
      model: MODEL_NAME,
      dimensions: this.dimensions,
      createdAt: new Date(),
    }
  }

  async embedBatch(texts: string[]): Promise<Embedding[]> {
    const pipe = await this.ensureReady()

    const output = await pipe(texts, {
      pooling: "mean",
      normalize: true,
    })

    // Batch output shape: [batch_size, dimensions]
    const data = output.data as Float32Array
    const now = new Date()

    const embeddings: Embedding[] = []
    for (let i = 0; i < texts.length; i++) {
      const start = i * this.dimensions
      const vector = Array.from(data.slice(start, start + this.dimensions))
      embeddings.push({
        vector,
        model: MODEL_NAME,
        dimensions: this.dimensions,
        createdAt: now,
      })
    }

    return embeddings
  }
}

/**
 * Singleton instance for convenience.
 * Model is lazy-loaded on first embed call.
 */
let defaultInstance: MiniLMEmbedder | null = null

export function getDefaultEmbedder(): MiniLMEmbedder {
  if (!defaultInstance) {
    defaultInstance = new MiniLMEmbedder()
  }
  return defaultInstance
}
