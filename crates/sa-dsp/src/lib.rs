//! sa-dsp：信号图元件。
//!
//! 硬约束：零 IO、零线程、零分配热路径，只做输入缓冲到输出缓冲的纯运算。
//! 实时试听与离线渲染共用这里的全部元件，不允许在 TS 侧另写一套。

pub mod bus;
pub mod oscillator;

pub use bus::{RenderBus, BLOCK_SAMPLES};
pub use oscillator::SineOsc;
