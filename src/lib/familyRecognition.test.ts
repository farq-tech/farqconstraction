import { expect, it } from 'vitest'
import { resolveOntology } from './procurementOntology'

// Families taken from manufacturer technical catalogues, deliberately without SKU matching.
it.each([
 ['Hydrophilic swelling waterbar', 'movement_joint_systems'],
 ['شريط مانع تسرب متمدد لفواصل الخرسانة', 'movement_joint_systems'],
 ['PVC waterstop for concrete construction joints', 'movement_joint_systems'],
 ['Intumescent firestop collar for pipe penetrations', 'passive_fire_protection'],
 ['Firestop sealant for wall penetrations', 'passive_fire_protection'],
 ['HDPE electrofusion coupling', 'pipes_fittings'],
 ['HDPE drainage pipe', 'pipes_fittings'],
 ['Circulator pump for hot water', 'pumps'],
 ['Variable speed booster pump', 'pumps'],
 ['Fire damper for HVAC duct', 'hvac_equipment'],
 ['Volume control damper', 'hvac_equipment'],
 ['Network sound projector PoE', 'av_communications'],
 ['Ceiling speaker for public address', 'av_communications'],
])('places %s in the correct family', (name, family) => {
 expect(resolveOntology(name).family).toBe(family)
})

it('does not suggest video projector sellers for a sound projector', () => {
 expect(resolveOntology('Network sound projector PoE').intent).toBe('pa_speaker')
 expect(resolveOntology('Laser projector 5000 lumens').intent).toBe('projector')
})

it('keeps firestop sealant in its specific sealant product pool', () => {
 const result = resolveOntology('Firestop sealant for wall penetrations')
 expect(result.intent).toBe('firestop_sealant')
 expect(result.family).toBe('passive_fire_protection')
})

it.each([
 ['Polyurethane waterproof coating', 'liquid_waterproofing', 'waterproofing'],
 ['Galvanized HVAC duct 0.8mm', 'galvanized_ductwork', 'hvac_equipment'],
 ['fire smoke damper', 'fire_smoke_damper', 'hvac_equipment'],
 ['سموك دامبر', 'fire_smoke_damper', 'hvac_equipment'],
 ['بوابه حديد مدخل', 'entrance_gate', 'industrial_doors'],
 ['Anchor bolt M16x200mm', 'mechanical_anchor', 'fasteners'],
 ['Chemical Anchor Stud M5x20', 'mechanical_anchor', 'fasteners'],
 ['Chemical anchor bolt M16', 'mechanical_anchor', 'fasteners'],
 ['كيميكال انكر مسمار M16', 'mechanical_anchor', 'fasteners'],
 ['Wedge anchor M16', 'mechanical_anchor', 'fasteners'],
 ['Mechanical anchor', 'mechanical_anchor', 'fasteners'],
 ['Chemical anchor resin', 'anchoring_epoxy', 'concrete_admixtures'],
 ['chemical anchoring resin', 'anchoring_epoxy', 'concrete_admixtures'],
 ['epoxy anchor adhesive', 'anchoring_epoxy', 'concrete_admixtures'],
 ['Epoxy anchor adhesive for threaded rod', 'anchoring_epoxy', 'concrete_admixtures'],
 ['Epoxy anchor adhesive for anchor bolt M16', 'anchoring_epoxy', 'concrete_admixtures'],
 ['Chemical anchor resin for anchor bolt M16', 'anchoring_epoxy', 'concrete_admixtures'],
 ['Resin anchor', 'anchoring_epoxy', 'concrete_admixtures'],
 ['Chemical anchor', 'anchoring_epoxy', 'concrete_admixtures'],
 ['كيميكال انكر', 'anchoring_epoxy', 'concrete_admixtures'],
 ['انكر كيميكال', 'anchoring_epoxy', 'concrete_admixtures'],
 ['Polyurethane foam insulation', 'spray_foam_insulation', 'thermal_insulation'],
 ['Flexible duct 200mm', 'flexible_duct', 'hvac_equipment'],
])('recognizes precise compound vocabulary %s without crossing families', (name, intent, family) => {
 const result = resolveOntology(name)
 expect(result.intent).toBe(intent)
 expect(result.family).toBe(family)
})

it.each([
 ['corrugated HDPE drainage pipe SN8 400mm', 'hdpe_pipe'],
 ['HDPE sewer pipe corrugated SN8', 'hdpe_pipe'],
 ['flexible galvanized HVAC duct 200mm', 'galvanized_ductwork'],
 ['galvanized HVAC duct connector canvas', 'galvanized_ductwork'],
])('does not promote ambiguous compound %s into the wrong product pool', (name, wrong) => {
 expect(resolveOntology(name).intent).not.toBe(wrong)
})
