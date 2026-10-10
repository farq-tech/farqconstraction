import { expect, it } from 'vitest'
import { resolveOntology } from './procurementOntology'

// Families taken from manufacturer technical catalogues, deliberately without SKU matching.
it.each([
 ['Hydrophilic swelling waterbar', 'movement_joint_systems'],
 ['شريط مانع تسرب متمدد لفواصل الخرسانة', 'movement_joint_systems'],
 ['PVC waterstop for concrete construction joints', 'movement_joint_systems'],
 ['Intumescent firestop collar for pipe penetrations', 'fire_fighting'],
 ['Firestop sealant for wall penetrations', 'fire_fighting'],
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

it.each([
 ['Polyurethane waterproof coating', 'liquid_waterproofing', 'waterproofing'],
 ['Galvanized HVAC duct 0.8mm', 'galvanized_ductwork', 'hvac_equipment'],
 ['Anchor bolt M16x200mm', 'mechanical_anchor', 'fasteners'],
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

it.each(['Chemical anchor resin', 'chemical anchoring resin', 'epoxy anchor adhesive', 'Resin anchor', 'Chemical anchor', 'كيميكال انكر', 'انكر كيميكال'])('routes adhesive %s to chemical anchoring rather than mechanical fixings', name => {
 const result = resolveOntology(name)
 expect(result.intent).toBe('anchoring_epoxy')
 expect(result.family).toBe('concrete_admixtures')
})
it.each(['Wedge anchor M16', 'Anchor bolt M16x200mm', 'Mechanical anchor'])('preserves mechanical product %s', name => {
 expect(resolveOntology(name).intent).toBe('mechanical_anchor')
})
