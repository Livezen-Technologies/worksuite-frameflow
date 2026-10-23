use std::collections::HashMap;

#[derive(Clone, Debug)]
pub struct EffectPass {
    pub shader: String,
    pub uniforms: HashMap<String, UniformValue>,
    /// Sample across the left/right edge, for equirectangular 360° frames
    /// whose edges meet (VR-18).
    pub wrap: bool,
}

#[derive(Clone, Debug)]
pub enum UniformValue {
    Number(f32),
    Vector(Vec<f32>),
}
