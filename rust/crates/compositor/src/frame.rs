use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::BlendMode;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameDescriptor {
    pub width: u32,
    pub height: u32,
    pub clear: CanvasClearDescriptor,
    pub items: Vec<FrameItemDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasClearDescriptor {
    pub color: [f32; 4],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum FrameItemDescriptor {
    Layer(LayerDescriptor),
    SceneEffect {
        // Enum-level rename_all only renames variants, not their fields.
        #[serde(rename = "effectPassGroups")]
        effect_pass_groups: Vec<Vec<EffectPassDescriptor>>,
        /// Limits the effect to this area of the frame (privacy regions).
        #[serde(default)]
        mask: Option<LayerMaskDescriptor>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerDescriptor {
    pub texture_id: String,
    pub transform: QuadTransformDescriptor,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    #[serde(default)]
    pub effect_pass_groups: Vec<Vec<EffectPassDescriptor>>,
    pub mask: Option<LayerMaskDescriptor>,
    /// Draws the source as a 360° sphere instead of a placed quad.
    #[serde(default)]
    pub projection: Option<ProjectionDescriptor>,
}

/// Virtual camera for equirectangular sources, angles in degrees.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectionDescriptor {
    pub yaw: f32,
    pub pitch: f32,
    pub roll: f32,
    pub fov: f32,
    /// 0 natural, 1 wide, 2 stereographic; fractions blend.
    pub lens: f32,
    /// Keep the output equirectangular (reorient only).
    #[serde(default)]
    pub equirectangular: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuadTransformDescriptor {
    pub center_x: f32,
    pub center_y: f32,
    pub width: f32,
    pub height: f32,
    pub rotation_degrees: f32,
    pub flip_x: bool,
    pub flip_y: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerMaskDescriptor {
    pub texture_id: String,
    pub feather: f32,
    pub inverted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectPassDescriptor {
    pub shader: String,
    pub uniforms: HashMap<String, EffectUniformValueDescriptor>,
    /// Wrap left/right for 360° frames (VR-18).
    #[serde(default)]
    pub wrap: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum EffectUniformValueDescriptor {
    Number(f32),
    Vector(Vec<f32>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasTextureDescriptor {
    pub id: String,
    pub width: u32,
    pub height: u32,
}
