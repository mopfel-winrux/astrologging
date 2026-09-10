::  configuration for the %astro-fileserver agent
::
|%
::  serve /web from this desk under /astro
::
++  web-root  ^-  (list @t)  /astro
::  extensionless urls fall back to the index file,
::  so both /astro and /astro/ serve /web/index.html
::
++  extension  %fall
--
