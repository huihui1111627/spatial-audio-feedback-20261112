//! 确定性 PRNG：xoshiro256**。
//!
//! 离线渲染的全部随机量（射线方向、FDN 相位抖动等）只允许来自这里，
//! 完整状态可序列化，保证同种子逐位复现、checkpoint 恢复后序列不断点。

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Xoshiro256 {
    s: [u64; 4],
}

impl Xoshiro256 {
    /// 用 64 位种子派生初始状态（splitmix64），允许用户只给一个种子。
    pub fn seeded(seed: u64) -> Self {
        let mut z = seed;
        let mut next = || {
            z = z.wrapping_add(0x9E37_79B9_7F4A_7C15);
            let mut x = z;
            x = (x ^ (x >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
            x = (x ^ (x >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
            x ^ (x >> 31)
        };
        Self {
            s: [next(), next(), next(), next()],
        }
    }

    pub fn next_u64(&mut self) -> u64 {
        let result = self.s[1]
            .wrapping_mul(5)
            .rotate_left(7)
            .wrapping_mul(9);

        let t = self.s[1] << 17;
        self.s[2] ^= self.s[0];
        self.s[3] ^= self.s[1];
        self.s[1] ^= self.s[2];
        self.s[0] ^= self.s[3];
        self.s[2] ^= t;
        self.s[3] = self.s[3].rotate_left(45);

        result
    }

    /// 均匀分布于 [0, 1)。
    pub fn next_f32(&mut self) -> f32 {
        // 取高 24 位映射到单精度，避免低位统计弱点。
        (self.next_u64() >> 40) as f32 / (1u64 << 24) as f32
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_same_sequence() {
        let mut a = Xoshiro256::seeded(42);
        let mut b = Xoshiro256::seeded(42);
        for _ in 0..1000 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
    }

    #[test]
    fn different_seeds_diverge() {
        let mut a = Xoshiro256::seeded(1);
        let mut b = Xoshiro256::seeded(2);
        assert_ne!(a.next_u64(), b.next_u64());
    }

    #[test]
    fn f32_in_unit_range() {
        let mut r = Xoshiro256::seeded(7);
        for _ in 0..10_000 {
            let x = r.next_f32();
            assert!((0.0..1.0).contains(&x));
        }
    }

    #[test]
    fn state_restore_continues_sequence() {
        let mut a = Xoshiro256::seeded(99);
        for _ in 0..500 {
            a.next_u64();
        }
        let snapshot = serde_json::to_string(&a).unwrap();
        let mut b: Xoshiro256 = serde_json::from_str(&snapshot).unwrap();
        for _ in 0..500 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
    }
}
