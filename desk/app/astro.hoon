::  astro: deep-sky observing log
::
::    keeps observations and observing gear. the object catalog is static
::    data under /web/data, served by %astro-fileserver at /astro.
::
::    pokes:  %astro-action (json or noun)
::    scries: /x/state /x/obs /x/obs/[obj] /x/seen /x/gear /x/site /x/plans
::    watch:  /updates
::
/-  *astro
/+  lib=astro, default-agent, dbug
::
|%
+$  versioned-state
  $%  state-0
  ==
+$  state-0
  $:  %0
      obs=(map id observation)
      next=id
      scopes=(map @t scope)
      eyepieces=(map @t eyepiece)
      rigs=(map @t rig)
      site=@t
      plans=(map @t plan)
  ==
+$  card  card:agent:gall
::
::  starter gear so the hints have something to work with;
::  delete or edit it from the equipment page.
::
++  seed-scopes
  ^-  (map @t scope)
  %-  ~(gas by *(map @t scope))
  :~  :-  '8" Dobsonian'
      ['8" Dobsonian' 'dob' 203 1.200 'example: edit or delete']
      :-  '80mm refractor'
      ['80mm refractor' 'refractor' 80 480 'example: edit or delete']
  ==
++  seed-eyepieces
  ^-  (map @t eyepiece)
  %-  ~(gas by *(map @t eyepiece))
  :~  ['25mm Plossl' '25mm Plossl' 250 52 'example']
      ['10mm Plossl' '10mm Plossl' 100 52 'example']
      ['6mm' '6mm' 60 60 'example']
  ==
++  seed-rigs
  ^-  (map @t rig)
  %-  ~(gas by *(map @t rig))
  :~  :-  'Seestar S50'
      ['Seestar S50' '250mm f/4 triplet' 'IMX462 (built in)' 'alt-az (built in)' 'LP dual-band' '10s subs']
      :-  'Club PlaneWave'
      ['Club PlaneWave' 'PlaneWave Delta Rho 350' 'ZWO ASI6200MC Pro' 'PlaneWave L-500' 'none / dual-band' 'gain 100, offset 50, -10C, 30s subs']
  ==
--
::
=|  state-0
=*  state  -
%-  agent:dbug
^-  agent:gall
|_  =bowl:gall
+*  this  .
    def   ~(. (default-agent this %.n) bowl)
::
++  on-init
  ^-  (quip card _this)
  :-  ~
  %=  this
    scopes     seed-scopes
    eyepieces  seed-eyepieces
    rigs       seed-rigs
    next       1
  ==
::
++  on-save  !>(state)
++  on-load
  |=  old=vase
  ^-  (quip card _this)
  =/  ver  !<(versioned-state old)
  ?-  -.ver
    %0  [~ this(state ver)]
  ==
::
++  on-poke
  |=  [=mark =vase]
  ^-  (quip card _this)
  =/  act=action
    ?+  mark  (on-poke:def mark vase)
      %astro-action  !<(action vase)
      %json          (action:dejs:lib !<(json vase))
      %noun          !<(action vase)
    ==
  ?-    -.act
      %add-obs
    =/  =id  next
    :_  this(obs (~(put by obs) id observation.act), next +(next))
    [%give %fact ~[/updates] %astro-update !>(`update`[%obs id observation.act])]~
  ::
      %edit-obs
    ?>  (~(has by obs) id.act)
    :_  this(obs (~(put by obs) id.act observation.act))
    [%give %fact ~[/updates] %astro-update !>(`update`[%obs id.act observation.act])]~
  ::
      %del-obs
    :_  this(obs (~(del by obs) id.act))
    [%give %fact ~[/updates] %astro-update !>(`update`[%del-obs id.act])]~
  ::
      %put-scope
    =.  scopes  (~(put by scopes) name.scope.act scope.act)
    [[%give %fact ~[/updates] %astro-update !>(`update`[%gear scopes eyepieces rigs])]~ this]
  ::
      %del-scope
    =.  scopes  (~(del by scopes) name.act)
    [[%give %fact ~[/updates] %astro-update !>(`update`[%gear scopes eyepieces rigs])]~ this]
  ::
      %put-eyepiece
    =.  eyepieces  (~(put by eyepieces) name.eyepiece.act eyepiece.act)
    [[%give %fact ~[/updates] %astro-update !>(`update`[%gear scopes eyepieces rigs])]~ this]
  ::
      %del-eyepiece
    =.  eyepieces  (~(del by eyepieces) name.act)
    [[%give %fact ~[/updates] %astro-update !>(`update`[%gear scopes eyepieces rigs])]~ this]
  ::
      %put-rig
    =.  rigs  (~(put by rigs) name.rig.act rig.act)
    [[%give %fact ~[/updates] %astro-update !>(`update`[%gear scopes eyepieces rigs])]~ this]
  ::
      %del-rig
    =.  rigs  (~(del by rigs) name.act)
    [[%give %fact ~[/updates] %astro-update !>(`update`[%gear scopes eyepieces rigs])]~ this]
  ::
      %set-site
    :_  this(site site.act)
    [%give %fact ~[/updates] %astro-update !>(`update`[%site site.act])]~
  ::
      %put-plan
    :_  this(plans (~(put by plans) name.plan.act plan.act))
    [%give %fact ~[/updates] %astro-update !>(`update`[%plan plan.act])]~
  ::
      %del-plan
    :_  this(plans (~(del by plans) name.act))
    [%give %fact ~[/updates] %astro-update !>(`update`[%del-plan name.act])]~
  ==
::
++  on-watch
  |=  =path
  ^-  (quip card _this)
  ?+  path  (on-watch:def path)
    [%updates ~]  [~ this]
  ==
::
++  on-peek
  |=  =path
  ^-  (unit (unit cage))
  ?+    path  (on-peek:def path)
      [%x %state ~]
    :^  ~  ~  %json
    !>  ^-  json
    %-  pairs:enjs:format
    :~  ship+s+(scot %p our.bowl)
        site+s+site
        obs+(obs-list:enjs:lib obs)
        gear+(gear:enjs:lib scopes eyepieces rigs)
        plans+(plans:enjs:lib plans)
    ==
  ::
      [%x %obs ~]
    ``json+!>((obs-list:enjs:lib obs))
  ::
      [%x %obs @ ~]
    =/  obj  i.t.t.path
    :^  ~  ~  %json
    !>  ^-  json
    %-  obs-list:enjs:lib
    %-  ~(gas by *(map id observation))
    %+  skim  ~(tap by obs)
    |=([id o=observation] =(obj.o obj))
  ::
      [%x %seen ~]
    :^  ~  ~  %json
    !>  ^-  json
    :-  %a
    %+  turn  ~(tap in (~(gas in *(set @t)) (turn ~(val by obs) |=(o=observation obj.o))))
    |=(t=@t s+t)
  ::
      [%x %gear ~]
    ``json+!>((gear:enjs:lib scopes eyepieces rigs))
  ::
      [%x %site ~]
    ``json+!>(`json`s+site)
  ::
      [%x %plans ~]
    ``json+!>((plans:enjs:lib plans))
  ==
::
++  on-leave  on-leave:def
++  on-agent  on-agent:def
++  on-arvo   on-arvo:def
++  on-fail   on-fail:def
--
