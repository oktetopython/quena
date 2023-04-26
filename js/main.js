// inputs
var maxHoleCount = 12;              // Number of flute finger holes
var holeCount = 7;                  // Number of flute finger holes
var fhDs = new Array(maxHoleCount+1); // finger hole diameters
var actEmbD;                        // physical embouchure hole diameter
var adjEmbD;                        // embouchure hole diameter, adusted for lip cover
var borD;                           // inside diameter of tube
var walW;                           // wall thickness of tube
var fhFs = new Array(maxHoleCount+1); // finger hole note frequencies
var endF;                           // all-holes-closed end-of-flute frequency

// raw results (distances from "beginning of air column" which is actually undefined)
var endX;                           // effective location of end of flute
var fhXs = new Array(maxHoleCount+1); // location of finger holes
var embX;                           // location of embouchure

var inMm = 25.4;                    // inches to mm
var sVMmS = 345000.0;                 // velocity of sound in mm/s
var unitMult = 1.0;                 // units multiplier (1 = mm)
var decPl = 1;                      // units decimal places
var firstLoad = true;

var defaultInitQuery = 'title=7-hole+C5&diamEmb=10&cents1=601&diam1=8&cents2=386&diam2=8.5&cents3=204&diam3=9&cents4=0&diam4=7&cents5=-102&diam5=9.5&cents6=-309&diam6=10&cents7=-498&diam7=5.5&cents8=-599&diam8=11.4561&cents9=-814&diam9=11.0976&cents10=-996&diam10=12.273&cents11=-1200&diam11=9.1133&cents12=-1302&diam12=12.7&centsEnd=-599&cents13=-1509&fHoles=7&keyNote=72&keyFT=0&borD=19&walW=1.25&lipCov=0&unitMult=1.0&decPl=1&showSpc=0&showFreqs=0';

var isTouchDevice = 'ontouchstart' in document.documentElement;

$.unparam = function (value) {
  var
  // Object that holds names => values.
    params = {},
  // Get query string pieces (separated by &)
    pieces = value.split('&'),
  // Temporary variables used in loop.
    pair, i, l;

  // Loop through query string pieces and assign params.
  for (i = 0, l = pieces.length; i < l; i++) {
    pair = pieces[i].split('=', 2);
    // Repeated parameters with the same name are overwritten. Parameters
    // with no value get set to boolean true.
    params[decodeURIComponent(pair[0])] = (pair.length == 2 ?
      decodeURIComponent(pair[1].replace(/\+/g, ' ')) : true);
  }

  return params;
};

$.fn.setValue = function(value) {
  return this.each(function(i, el) {
    if ($(el).is('select')) {
      $(el).val(value).change();
    } else if ($(el).is('[type=checkbox]')) {
      if (parseInt(value) > 0)
        $(el).click();
    } else if ($(el).hasClass('text')) {
      $(el).val(value);
      if ($(el).attr('id') == 'title' && !firstLoad)
        document.title = 'Flutomat - ' + value;
    } else {
      var mult = 1;
      if ($(el).hasClass('measure'))
        mult = unitMult;
      $(el).attr('data-value', parseFloat((value * mult).toFixed(4)));
      value = parseFloat(value);
      if (isNaN(value) || $(el).hasClass('measure') && value < 0) {
        $(el).val('X');
        $(el).addClass('calc-error');
      } else {
        var dp = decPl;
        if ($(el).hasClass('cutoff'))
          dp = 1;
        if ($(el).data('extra-dp'))
          dp = dp + parseInt($(el).data('extra-dp'));
        $(el).val(value.toFixed(dp));
      }
    }
  });
}

$.fn.getValue = function(getData) {
  if (this.is('select') || this.hasClass('text'))
    return this.val();
  if (this.is('[type=checkbox]')) {
    if (this[0].checked)
      return this.val();
    return 0;
  }
  if (getData) {
    var value = this.attr('data-value');
    if (typeof value == 'undefined') {
      if (this.hasClass('measure'))
        return parseFloat(this.val() / unitMult);
      return parseFloat(this.val());
    }
    return value;
  }
  if (this.hasClass('measure'))
    return parseFloat(this.val()/unitMult);
  return parseFloat(this.val());
}

$.fn.refreshValue = function() {
  return this.each(function(i, el) {
    var value = $(el).attr('data-value');
    if (typeof value == 'undefined')
      value = $(el).val();
    if ($(el).hasClass('measure'))
      $(el).setValue(value/unitMult);
    else
      $(el).setValue(value);
  });
}

$.fn.hasHorizontalScrollBar = function() {
  if (this[0].clientWidth < this[0].scrollWidth) {
    return true
  } else {
    return false
  }
}

function webgl_support() {
  try {
    var canvas = document.createElement('canvas');
    return !!window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch(e) {
    return false;
  }
};

// effective wall thickness, i.e. height of air column at open finger holes;
// air column extends out past end of hole 3/4 of the hole diameter
function effWalW(holeNum) {
  return walW + 0.75 * fhDs[holeNum];
}

// Closed hole for tone hole n.  The length of the vibrating air column is
// effectively increased by each closed tone hole which exists above the
// first open tone hole. Corrections must be added for each such closed tone
// tone hole to endCorr, openFH1Corr, and openFHCorr.
function closedFHCorr(holeNum) {
  var fhBorRatio = fhDs[holeNum] / borD;
  return 0.25 * walW * fhBorRatio * fhBorRatio;
}

// Calculates the distance from physical open end of flute to effective end of
// vibrating air column.  The vibrating air column ends beyond the end of the
// flute and endCorr is always positive. NOTE: Closed hole corrections must be added to
// this value!
function endCorr() {
  return 0.30665 * borD;
}

// Calculates the effective distance from the first ("single") tone hole to
// the end of the vibrating air column when only that hole is open.
// NOTE: closed hole corrections must be added to this value!
function openFH1Corr() {
  var borFh1Ratio = borD / fhDs[1];
  return  (endX - fhXs[1]) * borFh1Ratio * borFh1Ratio;
}

// Calculates the effective distance from the second and subsequent tone holes
// to the end of the vibrating air column when all holes below are open.
// NOTE: closed hole corrections must be added to this value!
// NOTE: the value of this correction is invalid if the frequency of the note
// played is above the cutoff frequency cutoffForHole.
function openFHCorr(n) {
  var borFhRatio = borD / fhDs[n];
  var fhXsDiff = fhXs[n-1] - fhXs[n];
  return 0.25 * fhXsDiff
    * (Math.sqrt(1 +  4 * borFhRatio * borFhRatio * effWalW(n) / fhXsDiff) -  1);
}

// embCorr = distance from theoretical start of air column to center of embouchure hole;
// the air column effectively extends beyond the blow hole center by this distance.
// (the cork face should be about 1 to 1.5 embouchure diameters from emb. center)
//embCorr := borEmbRatio*borEmbRatio*(walW+0.75*adjEmbD); // per spreadsheet
//embCorr := borEmbRatio*borEmbRatio*(borD/2 + walW + 0.6133*adjEmbD/2); // an alternative
//embCorr := 10.84*borEmbRatio*borEmbRatio*walW*adjEmbD/(borD + 2*walW); // kosel's empirical fit
function embCorr() {
  var borEmbRatio = borD / adjEmbD;
  //return borEmbRatio * borEmbRatio * (walW + 0.75 * adjEmbD); // per spreadsheet
  return borEmbRatio * borEmbRatio * (borD / 2 + walW + 0.6133 * adjEmbD / 2); // an alternative
  //return borEmbRatio * borEmbRatio * (walW + 1.7 * adjEmbD); // http://www.phy.mtu.edu/~suits/fingers.html
  //return 10.84 * borEmbRatio * borEmbRatio * walW * adjEmbD / (borD + 2 * walW); // kosel's empirical fit
}

// Calculates the cutoff frequency above which the open hole correction
// is not valid.  Instrument should be designed so that all second register
// notes are well below this frequency.
function cutoffForHole(n) {
  if (n == 1)
    fhXsDiff = endX - fhXs[1];
  else
    fhXsDiff = fhXs[n-1] - fhXs[n];
  return 0.5 * sVMmS * fhDs[n] / (Math.PI * borD * Math.sqrt(effWalW(n) * fhXsDiff));
}

// This procedure finds the locations of end of flute, all finger holes, and emb. hole
// This involves use
// of quadratic solutions of the Benade equations obtained by "simple but tedious algebraic
// manipulation".
function findLocations2() {
  var i;
  var L;
  var holeNum;
  var a,b,c;

// find end location...
  endX = sVMmS * 0.5 / endF;  // uncorrected location
  endX = endX - endCorr();  // subtract end correction
  for (i=1; i<=holeCount; i++)
    endX = endX - closedFHCorr(i);  // subtract closed hole corrections

// find first finger hole location
  var halfWl = sVMmS * 0.5 / fhFs[1];
  for (i=2; i<=holeCount; i++)
    halfWl -= closedFHCorr(i);  // subtract closed hole corrections
  var fhBorRatio = fhDs[1] / borD;
  var a = fhBorRatio * fhBorRatio;
  var b = -(endX + halfWl) * a;
  var c = endX * halfWl * a + effWalW(1) * (halfWl - endX);
  fhXs[1] = (-b - Math.sqrt((b * b) - 4 * a * c) ) / (2 * a);

// find subsequent finger hole locations
  if (holeCount >= 2) {
    for (holeNum = 2; holeNum <= holeCount; holeNum++) {
      halfWl = 0.5 * sVMmS / fhFs[holeNum];
      if (holeNum < holeCount)
        for (i = holeNum; i <= holeCount; i++)
          halfWl -= closedFHCorr(i);
      a = 2;
      var borFhRatio = borD / fhDs[holeNum];
      var holeCalc = effWalW(holeNum) * borFhRatio * borFhRatio;
      b = -fhXs[holeNum - 1] - 3 * halfWl + holeCalc;
      c = fhXs[holeNum - 1] * (halfWl - holeCalc) + (halfWl * halfWl);
      fhXs[holeNum] = (-b - Math.sqrt((b * b) - 4 * a * c)) / (2 * a);
    }
  }

// set embouchure hole location
  embX = embCorr();
}

function midiNumberToPitch(num) {
  return Math.round(440.0*Math.pow(2, (num-69.0)/12.0));
}

function calculateHoleFreqs() {
  var keyPitch = midiNumberToPitch(parseInt($('#keyNote').val())+0.01*parseInt($('#keyFT').val()));
  for (i=1; i<=maxHoleCount+1; i++) {
    var j = holeCount+1-i;
    var centVal =  $('input#cents' + i + '').getValue();
    var freq = keyPitch * Math.pow(2, centVal/1200.0);
    $('input#freq' + i + '').setValue(freq);
    if (j > 0) {
      fhFs[j] = freq;
      fhDs[j] = $('input#diam' + i + '').getValue();
    }
  }
  var j = holeCount+1-i;
  var centVal =  $('input#centsEnd').getValue();
  endF = keyPitch * Math.pow(2, centVal/1200.0);
  $('input#freqEnd').setValue(endF);
}

function updateHoleCount(newhc) {
  holeCount = newhc;
  $('select#fHoles').val(holeCount);
  for (i=1; i<=maxHoleCount; i++) {
    if (i<=holeCount)
      $('#hole-row-'+i).stop().fadeIn(restripeTable);
    else
      $('#hole-row-'+i).stop().fadeOut(restripeTable);
  }
  calculateHoleFreqs();

  $('a.dec-holes, a.inc-holes').removeClass('inactive');
  if (holeCount == maxHoleCount)
    $('a.inc-holes').addClass('inactive');
  else if (holeCount == 0)
    $('a.dec-holes').addClass('inactive');
}

function clearFlute() {
  $('canvas#flute-canvas').clearCanvas();
}

function drawFlute() {
  if ($('.calc-error').length) {
    clearFlute();
    return;
  }
  var canvas = $('canvas#flute-canvas')[0];
  var cW = $('canvas#flute-canvas').width();
  var cH_2 = 0.5*$('canvas#flute-canvas').height();
  canvas.width  = cW;
  canvas.height = $('canvas#flute-canvas').height();
  var embX = $('input#resultEmb').getValue();
  var extW = borD + walW*2;
  var fluteLength = embX + extW * 1.5;
  var scale = cW / fluteLength;
  $('canvas#flute-canvas').drawRect({
    fromCenter: false,
    fillStyle: '#333',
    x: 0,
    y: cH_2-0.5*scale*extW,
    width: cW,
    height: scale*extW
  });
  $('canvas#flute-canvas').drawRect({
    fromCenter: false,
    fillStyle: '#fff',
    x: 1,
    y: cH_2-0.5*scale*borD,
    width: cW-2,
    height: scale*borD
  });
  $('canvas#flute-canvas').drawArc({
    fillStyle: '#333',
    x: cW - scale*embX,
    y: cH_2,
    radius: 0.5*scale*actEmbD
  });
  for (i=1; i<=holeCount; i++)
    $('canvas#flute-canvas').drawArc({
      fillStyle: '#333',
      x: cW - scale*$('input#result'+i+'').getValue(),
      y: cH_2,
      radius: 0.5*scale*fhDs[holeCount+1-i]
    });
}

function restripeTable() {
  $("table#holes-table tr:visible").each(function (index) {
    $(this).toggleClass("stripe", !!(index & 1));
  });
}

function checkResponsiveTableScroll() {
  $('.table-responsive').removeClass('noscroll')
  if (!$('.table-responsive').hasHorizontalScrollBar())
    $('.table-responsive').addClass('noscroll')
}

function copyHiddenHoleToEndCents() {
  var endCents = $('input#cents'+(holeCount+1)+'').getValue();
  if (endCents)
    $('input#centsEnd').setValue(endCents);
}

function copyEndCentsToHiddenHole() {
  var endCents = $('input#centsEnd').getValue();
  if (endCents)
    $('input#cents'+(holeCount+1)+'').setValue(endCents);
}

function initInputs() {
  getURLVars(defaultInitQuery);
  if (location.hash)
    getURLVars();
  updateHoleCount(holeCount);
  calcFlute();
}

function getURLVars(hash) {
  if (!hash)
    hash = location.hash.replace(/^#/, '');
  var params = $.unparam(hash);
  $.each(params, function(key, val) {
    $(':input#'+key).setValue(val);
  });
  copyEndCentsToHiddenHole();
}

function initControls() {
  if (window.devicePixelRatio == 2)
    $('.iotic-logo').attr('src', 'img/iotic-logo@2x.png');

  $(window).resize(function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function() {
      drawFlute();
      checkResponsiveTableScroll();
    }, 100);
  });

  $('body').on('focus', '[contenteditable]', function() {
    var $this = $(this);
    $this.data('before', $this.html());
    return $this;
  }).on('blur keyup paste input', '[contenteditable]', function() {
    var $this = $(this);
    if ($this.data('before') !== $this.html()) {
      $this.data('before', $this.html());
      $this.trigger('change');
    }
    return $this;
  }).on('change', '[contenteditable]', checkResponsiveTableScroll);

  $('[data-toggle="popover"]').popover({
    trigger: 'hover'
  });

  if (webgl_support())
    $('#show-3d').show();

  if (isTouchDevice) {
    $('body').addClass('touch');
    $('input[type=text]:not(.text)').click(function () {
      $(this).select();
    });
  } else
    $('body').addClass('mouse');

  $('.close-threed').click(function() {
    $(this).fadeOut();
    $('#threed').fadeOut(function() {
      $("#threed").contents().find("body").html('');
      $('body').css('overflow', 'auto');
      $('.main-content').show();
      $('.header').show();
      drawFlute();
    });
  });

  $('#show-3d').click(function() {
    var query = $(':input.3d-info:visible').serialize();
    //$(':input.3d-info:visible').each(function() {
    //  console.log(this);
    //});
    query += "&portrait="+((window.innerWidth < window.innerHeight) ? '1' : '0');
    $('body').css('overflow', 'hidden');
    console.log('./OpenJSCAD/?'+query);
    $('#threed').attr('src', './OpenJSCAD/?'+query).fadeIn(600, function() {
      $('.close-threed').fadeIn();
      $('.main-content').hide();
      $('.header').hide();
    });
  });

  $('tr#hole-row-0').stop().fadeIn();

  $('select#unitMult').change(function() {
    unitMult = parseFloat($(this).val());
    var opt = $(this).find("option[value='"+$(this).val()+"']").text();
    var dp = 1;
    if (opt == 'inches')
      dp = 3;
    else if (opt == 'cm')
      dp = 2;
    $('select#decPl').val(dp).change();
    $('input.measure').refreshValue();
    if (!firstLoad)
      calcFlute();
  });

  $('select#decPl').change(function() {
    decPl = parseInt($(this).val());
    $('input.measure').refreshValue();
    if (!firstLoad)
      calcFlute();
  });

  $('select#fHoles').change(function() {
    holeCount = parseInt($(this).val());
    if (!firstLoad) {
      updateHoleCount(holeCount);
      copyHiddenHoleToEndCents();
      calcFlute();
    }
  });

  $('input.form-control:not([readonly])').change(function() {
    if ($(this).hasClass('text'))
      $(this).setValue($(this).val());
    else
      $(this).setValue(parseFloat($(this).val()));
    if (!firstLoad)
      calcFlute();
  });

  $('input[type=checkbox]').click(function() {
    if (!firstLoad)
      calcFlute();
  });

  $('select#keyNote, select#keyFT').change(function() {
    if (!firstLoad)
      calcFlute();
  });

  $('a.inc-holes').click(function(e) {
    e.preventDefault();
    if (holeCount == maxHoleCount)
      return;
    updateHoleCount(holeCount+1);
    copyHiddenHoleToEndCents();
    calcFlute();
  });

  $('a.dec-holes').click(function(e) {
    e.preventDefault();
    if (holeCount == 0)
      return;
    updateHoleCount(holeCount-1);
    copyHiddenHoleToEndCents();
    calcFlute();
    $('td.spacing input:visible').last().addClass("hidden");
  });

  $('input#showSpc').click(function() {
    $('td.spacing, th.spacing').stop().fadeToggle();
  });

  $('input#showFreqs').click(function() {
    $('td.freq, th.freq').stop().fadeToggle();
  });
}

// This function does the gruntwork of getting input, calling the calculation routine,
// and delivering the results
function calcFlute() {
  $('input').removeClass('calc-error');
  unitMult = parseFloat($('select#unitMult').val());
  borD = $('input#borD').getValue();
  walW = $('input#walW').getValue();
  decPl = parseInt($('select#decPl').val());
  var scaleEmb = 1 - 0.01 * $('input#lipCov').getValue();
  actEmbD = $('input#diamEmb').getValue();
  adjEmbD = scaleEmb * actEmbD;
  calculateHoleFreqs();
  findLocations2();
  $('input#resultEmb').setValue((endX - embX) / unitMult);
  if (actEmbD > borD*0.9) {
    $('input#diamEmb').addClass('calc-error');
    $('input#resultEmb').setValue(NaN);
  }
  for (j=1; j<=holeCount; j++) {
    var i = holeCount + 1 - j;
    $('input#result' + j + '').setValue((endX - fhXs[i]) / unitMult);
    if (fhDs[i] > borD*0.9) {
      $('input#diam' + j + '').addClass('calc-error');
      $('input#result' + j + '').setValue(NaN);
    }
    $('input#cutoff' + j + '').setValue(cutoffForHole(i));
    if (i == 1)
      $('input#spacing' + j + '').setValue((endX - fhXs[i]) / unitMult);
    else
      $('input#spacing' + j + '').setValue((fhXs[i-1] - fhXs[i]) / unitMult);
  }
  $('input#resultEnd').setValue(endX-endX); // = 0
  drawFlute();
  updateURL();
}

function updateURL() {
  if (firstLoad) {
    firstLoad = false;
    return;
  }
  var params = {};
  $('.container :input:not([readonly])').each(function() {
    var id = $(this).attr('id');
    if (typeof id == 'undefined') return;
    params[id] = $(this).getValue(true);
  });
  var qstr = $.param(params);
  location.hash = qstr;
}

var resizeTimeout;
$(function() {
  initControls();
  initInputs();
  setTimeout(checkResponsiveTableScroll, 600);
});
