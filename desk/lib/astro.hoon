::  astro: json conversions
::
/-  astro
|%
++  enjs
  =,  enjs:format
  |%
  ++  observation
    |=  o=observation:astro
    ^-  json
    %-  pairs
    :~  obj+s+obj.o
        when+(time when.o)
        site+s+site.o
        scope+s+scope.o
        eyepiece+s+eyepiece.o
        seeing+(numb seeing.o)
        transparency+(numb transparency.o)
        notes+s+notes.o
        imaged+b+imaged.o
        rig+s+rig.o
    ==
  ::
  ++  obs-entry
    |=  [id=id:astro o=observation:astro]
    ^-  json
    =/  j  (observation o)
    ?>  ?=([%o *] j)
    [%o (~(put by p.j) 'id' (numb id))]
  ::
  ++  obs-list
    |=  obs=(map id:astro observation:astro)
    ^-  json
    :-  %a
    %+  turn  (sort ~(tap by obs) |=([a=[@ *] b=[@ *]] (lth -.a -.b)))
    obs-entry
  ::
  ++  scope
    |=  s=scope:astro
    ^-  json
    %-  pairs
    :~  name+s+name.s
        kind+s+kind.s
        aperture+(numb aperture.s)
        focal+(numb focal.s)
        notes+s+notes.s
    ==
  ::
  ++  eyepiece
    |=  e=eyepiece:astro
    ^-  json
    %-  pairs
    :~  name+s+name.e
        focal+(numb focal.e)
        afov+(numb afov.e)
        notes+s+notes.e
    ==
  ::
  ++  rig
    |=  r=rig:astro
    ^-  json
    %-  pairs
    :~  name+s+name.r
        optics+s+optics.r
        camera+s+camera.r
        mount+s+mount.r
        filters+s+filters.r
        notes+s+notes.r
    ==
  ::
  ++  plan
    |=  p=plan:astro
    ^-  json
    %-  pairs
    :~  name+s+name.p
        date+(time date.p)
        site+s+site.p
        targets+a+(turn targets.p |=(t=@t s+t))
        notes+s+notes.p
        start+?~(start.p ~ (time u.start.p))
        end+?~(end.p ~ (time u.end.p))
    ==
  ::
  ++  plans
    |=  ps=(map @t plan:astro)
    ^-  json
    a+(turn ~(val by ps) plan)
  ::
  ++  gear
    |=  [scopes=(map @t scope:astro) eyepieces=(map @t eyepiece:astro) rigs=(map @t rig:astro)]
    ^-  json
    %-  pairs
    :~  scopes+a+(turn ~(val by scopes) scope)
        eyepieces+a+(turn ~(val by eyepieces) eyepiece)
        rigs+a+(turn ~(val by rigs) rig)
    ==
  ::
  ++  update
    |=  u=update:astro
    ^-  json
    %-  pairs
    ?-  -.u
      %obs      ~[obs+(obs-entry id.u observation.u)]
      %del-obs  ~[del-obs+(numb id.u)]
      %gear     ~[gear+(gear +.u)]
      %site     ~[site+s+site.u]
      %plan     ~[plan+(plan plan.u)]
      %del-plan  ~[del-plan+s+name.u]
    ==
  --
::
++  dejs
  =,  dejs:format
  |%
  ++  observation
    ^-  $-(json observation:astro)
    %-  ot
    :~  obj+so
        when+di
        site+so
        scope+so
        eyepiece+so
        seeing+ni
        transparency+ni
        notes+so
        imaged+bo
        rig+so
    ==
  ::
  ++  scope
    ^-  $-(json scope:astro)
    (ot name+so kind+so aperture+ni focal+ni notes+so ~)
  ::
  ++  eyepiece
    ^-  $-(json eyepiece:astro)
    (ot name+so focal+ni afov+ni notes+so ~)
  ::
  ++  rig
    ^-  $-(json rig:astro)
    (ot name+so optics+so camera+so mount+so filters+so notes+so ~)
  ::
  ++  plan
    ^-  $-(json plan:astro)
    (ot name+so date+di site+so targets+(ar so) notes+so start+(mu di) end+(mu di) ~)
  ::
  ++  action
    |=  jon=json
    ^-  action:astro
    ?>  ?=([%o [@ *] ~ ~] jon)
    =*  key  p.n.p.jon
    =*  val  q.n.p.jon
    ?+  key  ~|(bad-key+key !!)
      %add-obs       [%add-obs (observation val)]
      %edit-obs      [%edit-obs ((ot id+ni observation+observation ~) val)]
      %del-obs       [%del-obs (ni val)]
      %put-scope     [%put-scope (scope val)]
      %del-scope     [%del-scope (so val)]
      %put-eyepiece  [%put-eyepiece (eyepiece val)]
      %del-eyepiece  [%del-eyepiece (so val)]
      %put-rig       [%put-rig (rig val)]
      %del-rig       [%del-rig (so val)]
      %set-site      [%set-site (so val)]
      %put-plan      [%put-plan (plan val)]
      %del-plan      [%del-plan (so val)]
    ==
  --
--
