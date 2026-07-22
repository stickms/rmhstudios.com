/**
 * Minimal ambient WebGPU declarations — just the surface `renderer-webgpu.ts`
 * touches. `@webgpu/types` is NOT a dependency (§ "no new dependencies"), and
 * this container's headless Chromium exposes no WebGPU adapter anyway, so we
 * declare only what the render pipeline uses rather than pulling the full spec.
 *
 * Scoped to this module via `declare global`; all types are optional-friendly so
 * detection (`navigator.gpu`) stays a runtime check.
 */

export {};

declare global {
  type GPUTextureFormat = string;
  type GPUBufferUsageFlags = number;
  type GPUShaderStageFlags = number;

  interface GPUSupportedLimits {
    readonly maxUniformBufferBindingSize: number;
  }

  interface GPU {
    requestAdapter(options?: unknown): Promise<GPUAdapter | null>;
    getPreferredCanvasFormat(): GPUTextureFormat;
  }

  interface GPUAdapter {
    requestDevice(descriptor?: unknown): Promise<GPUDevice>;
    readonly limits: GPUSupportedLimits;
  }

  interface GPUQueue {
    writeBuffer(
      buffer: GPUBuffer,
      bufferOffset: number,
      data: BufferSource,
      dataOffset?: number,
      size?: number,
    ): void;
    submit(commandBuffers: GPUCommandBuffer[]): void;
  }

  interface GPUDevice {
    readonly queue: GPUQueue;
    readonly limits: GPUSupportedLimits;
    createShaderModule(descriptor: { code: string }): GPUShaderModule;
    createBuffer(descriptor: {
      size: number;
      usage: GPUBufferUsageFlags;
      mappedAtCreation?: boolean;
    }): GPUBuffer;
    createBindGroupLayout(descriptor: unknown): GPUBindGroupLayout;
    createPipelineLayout(descriptor: {
      bindGroupLayouts: GPUBindGroupLayout[];
    }): GPUPipelineLayout;
    createRenderPipeline(descriptor: unknown): GPURenderPipeline;
    createBindGroup(descriptor: unknown): GPUBindGroup;
    createCommandEncoder(): GPUCommandEncoder;
    destroy(): void;
  }

  interface GPUBuffer {
    destroy(): void;
  }
  interface GPUShaderModule {
    _brand?: 'shader';
  }
  interface GPUBindGroupLayout {
    _brand?: 'bgl';
  }
  interface GPUPipelineLayout {
    _brand?: 'pl';
  }
  interface GPURenderPipeline {
    getBindGroupLayout(index: number): GPUBindGroupLayout;
  }
  interface GPUBindGroup {
    _brand?: 'bg';
  }
  interface GPUCommandBuffer {
    _brand?: 'cmd';
  }

  interface GPUTexture {
    createView(): GPUTextureView;
  }
  interface GPUTextureView {
    _brand?: 'view';
  }

  interface GPURenderPassEncoder {
    setPipeline(pipeline: GPURenderPipeline): void;
    setBindGroup(index: number, bindGroup: GPUBindGroup): void;
    draw(vertexCount: number, instanceCount?: number): void;
    end(): void;
  }

  interface GPUCommandEncoder {
    beginRenderPass(descriptor: unknown): GPURenderPassEncoder;
    finish(): GPUCommandBuffer;
  }

  interface GPUCanvasContext {
    configure(configuration: {
      device: GPUDevice;
      format: GPUTextureFormat;
      alphaMode?: string;
    }): void;
    getCurrentTexture(): GPUTexture;
  }

  interface Navigator {
    readonly gpu?: GPU;
  }

  const GPUBufferUsage: {
    UNIFORM: number;
    COPY_DST: number;
    STORAGE: number;
    VERTEX: number;
  };
  const GPUShaderStage: {
    VERTEX: number;
    FRAGMENT: number;
  };
}
