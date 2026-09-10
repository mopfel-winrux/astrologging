::  astro: observing log types
::
::    the object catalog itself is static data served from /web/data;
::    the agent only keeps what the observer adds: observations and gear.
::
|%
+$  id  @ud
::  $observation: one session at the eyepiece (or camera) on one object
::
+$  observation
  $:  obj=@t             ::  catalog id, e.g. 'NGC0224', 'B033', 'DBL-Albireo'
      when=@da           ::  time of observation
      site=@t            ::  observing site name (free text)
      scope=@t           ::  key into scopes, or ''
      eyepiece=@t        ::  key into eyepieces, or ''
      seeing=@ud         ::  0 unknown, 1 (poor) .. 5 (excellent)
      transparency=@ud   ::  0 unknown, 1 (poor) .. 5 (excellent)
      notes=@t
      imaged=?           ::  did we also image it?
      rig=@t             ::  key into rigs (imaging setup), or ''
  ==
::  $scope: a visual telescope. aperture and focal length in mm
::
+$  scope
  $:  name=@t
      kind=@t            ::  'refractor' 'reflector' 'sct' 'mak' 'dob' 'binocular' ...
      aperture=@ud       ::  mm
      focal=@ud          ::  mm
      notes=@t
  ==
::  $eyepiece: focal length in tenths of a millimeter (so 8.8mm = 88)
::
+$  eyepiece
  $:  name=@t
      focal=@ud          ::  0.1 mm units
      afov=@ud           ::  apparent field of view, degrees
      notes=@t
  ==
::  $rig: an imaging setup
::
+$  rig
  $:  name=@t
      optics=@t          ::  telescope / lens
      camera=@t
      mount=@t
      filters=@t
      notes=@t
  ==
::  $plan: a target list for one night
::
+$  plan
  $:  name=@t
      date=@da           ::  local noon of the observing date (as unix ms from the UI)
      site=@t
      targets=(list @t)  ::  catalog ids, in observing order
      notes=@t
  ==
::
+$  action
  $%  [%add-obs =observation]
      [%edit-obs =id =observation]
      [%del-obs =id]
      [%put-scope =scope]
      [%del-scope name=@t]
      [%put-eyepiece =eyepiece]
      [%del-eyepiece name=@t]
      [%put-rig =rig]
      [%del-rig name=@t]
      [%set-site site=@t]
      [%put-plan =plan]
      [%del-plan name=@t]
  ==
::
+$  update
  $%  [%obs =id =observation]
      [%del-obs =id]
      [%gear scopes=(map @t scope) eyepieces=(map @t eyepiece) rigs=(map @t rig)]
      [%site site=@t]
      [%plan =plan]
      [%del-plan name=@t]
  ==
--
