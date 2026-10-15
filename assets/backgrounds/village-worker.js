function conceptVillageGenerator(){

  var Prng = new function() {
    this.s = 1234;
    this.p = 999979; //9887//983
    this.q = 999983; //9967//991
    this.m = this.p * this.q;
    this.hash = function(x) {
      var y = self.btoa(JSON.stringify(x));
      var z = 0;
      for (var i = 0; i < y.length; i++) {
        z += y.charCodeAt(i) * Math.pow(128, i);
      }
      return z;
    };
    this.seed = function(x) {
      if (x == undefined) {
        x = new Date().getTime();
      }
      var y = 0;
      var z = 0;
      function redo() {
        y = (Prng.hash(x) + z) % Prng.m;
        z += 1;
      }
      while (y % Prng.p == 0 || y % Prng.q == 0 || y == 0 || y == 1) {
        redo();
      }
      Prng.s = y;
      console.log(["int seed", Prng.s]);
      for (var i = 0; i < 10; i++) {
        Prng.next();
      }
    };
    this.next = function() {
      Prng.s = (Prng.s * Prng.s) % Prng.m;
      return Prng.s / Prng.m;
    };
    this.test = function(f) {
      var F =
        f ||
        function() {
          return Prng.next();
        };
      var t0 = new Date().getTime();
      var chart = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (var i = 0; i < 10000000; i++) {
        chart[Math.floor(F() * 10)] += 1;
      }
      console.log(chart);
      console.log("finished in " + (new Date().getTime() - t0));
      return chart;
    };
  }();
  Math.random = function() {
    return Prng.next();
  };
  Math.seed = function(x) {
    return Prng.seed(x);
  };


  function parseArgs(key2f) {
    var par = self.location.href.split("?")[1];
    if (par == undefined) {
      return;
    }
    par = par.split("&");
    for (var i = 0; i < par.length; i++) {
      var e = par[i].split("=");
      try {
        key2f[e[0]](e[1]);
      } catch (e) {
        console.log(e);
      }
    }
  }
  SEED = "" + new Date().getTime();
  parseArgs({
    seed: function(x) {
      SEED = x == "" ? SEED : x;
    },
  });
  Math.seed(SEED);
  console.log(Prng.seed);


  //https://raw.githubusercontent.com/processing/p5.js/master/src/math/noise.js
  var Noise = new function() {
    var PERLIN_YWRAPB = 4;
    var PERLIN_YWRAP = 1 << PERLIN_YWRAPB;
    var PERLIN_ZWRAPB = 8;
    var PERLIN_ZWRAP = 1 << PERLIN_ZWRAPB;
    var PERLIN_SIZE = 4095;
    var perlin_octaves = 4;
    var perlin_amp_falloff = 0.5;
    var scaled_cosine = function(i) {
      return 0.5 * (1.0 - Math.cos(i * Math.PI));
    };
    var perlin;
    this.noise = function(x, y, z) {
      y = y || 0;
      z = z || 0;
      if (perlin == null) {
        perlin = new Array(PERLIN_SIZE + 1);
        for (var i = 0; i < PERLIN_SIZE + 1; i++) {
          perlin[i] = Math.random();
        }
      }
      if (x < 0) {
        x = -x;
      }
      if (y < 0) {
        y = -y;
      }
      if (z < 0) {
        z = -z;
      }
      var xi = Math.floor(x),
        yi = Math.floor(y),
        zi = Math.floor(z);
      var xf = x - xi;
      var yf = y - yi;
      var zf = z - zi;
      var rxf, ryf;
      var r = 0;
      var ampl = 0.5;
      var n1, n2, n3;
      for (var o = 0; o < perlin_octaves; o++) {
        var of = xi + (yi << PERLIN_YWRAPB) + (zi << PERLIN_ZWRAPB);
        rxf = scaled_cosine(xf);
        ryf = scaled_cosine(yf);
        n1 = perlin[of & PERLIN_SIZE];
        n1 += rxf * (perlin[(of + 1) & PERLIN_SIZE] - n1);
        n2 = perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
        n2 += rxf * (perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n2);
        n1 += ryf * (n2 - n1);
        of += PERLIN_ZWRAP;
        n2 = perlin[of & PERLIN_SIZE];
        n2 += rxf * (perlin[(of + 1) & PERLIN_SIZE] - n2);
        n3 = perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
        n3 += rxf * (perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n3);
        n2 += ryf * (n3 - n2);
        n1 += scaled_cosine(zf) * (n2 - n1);
        r += n1 * ampl;
        ampl *= perlin_amp_falloff;
        xi <<= 1;
        xf *= 2;
        yi <<= 1;
        yf *= 2;
        zi <<= 1;
        zf *= 2;
        if (xf >= 1.0) {
          xi++;
          xf--;
        }
        if (yf >= 1.0) {
          yi++;
          yf--;
        }
        if (zf >= 1.0) {
          zi++;
          zf--;
        }
      }
      return r;
    };
    this.noiseDetail = function(lod, falloff) {
      if (lod > 0) {
        perlin_octaves = lod;
      }
      if (falloff > 0) {
        perlin_amp_falloff = falloff;
      }
    };
    this.noiseSeed = function(seed) {
      var lcg = (function() {
        var m = 4294967296,
          a = 1664525,
          c = 1013904223,
          seed,
          z;
        return {
          setSeed: function(val) {
            z = seed = (val == null ? Math.random() * m : val) >>> 0;
          },
          getSeed: function() {
            return seed;
          },
          rand: function() {
            z = (a * z + c) % m;
            return z / m;
          },
        };
      })();
      lcg.setSeed(seed);
      perlin = new Array(PERLIN_SIZE + 1);
      for (var i = 0; i < PERLIN_SIZE + 1; i++) {
        perlin[i] = lcg.rand();
      }
    };
  }();


  var PolyTools = new function() {
    this.midPt = function() {
      var plist =
        arguments.length == 1 ? arguments[0] : Array.apply(null, arguments);
      return plist.reduce(
        function(acc, v) {
          /*       if (v == undefined || acc == undefined){
        console.log("ERRR");
        console.log(plist)
        return [0,0]
      } */
          return [v[0] / plist.length + acc[0], v[1] / plist.length + acc[1]];
        },
        [0, 0],
      );
    };
    this.triangulate = function(plist, args) {
      //return []
      var args = args != undefined ? args : {};
      var area = args.area != undefined ? args.area : 100;
      var convex = args.convex != undefined ? args.convex : false;
      var optimize = args.optimize != undefined ? args.optimize : true;
      function lineExpr(pt0, pt1) {
        var den = pt1[0] - pt0[0];
        var m = den == 0 ? Infinity : (pt1[1] - pt0[1]) / den;
        var k = pt0[1] - m * pt0[0];
        return [m, k];
      }
      function intersect(ln0, ln1) {
        var le0 = lineExpr(...ln0);
        var le1 = lineExpr(...ln1);
        var den = le0[0] - le1[0];
        if (den == 0) {
          return false;
        }
        var x = (le1[1] - le0[1]) / den;
        var y = le0[0] * x + le0[1];
        function onSeg(p, ln) {
          //non-inclusive
          return (
            Math.min(ln[0][0], ln[1][0]) <= p[0] &&
            p[0] <= Math.max(ln[0][0], ln[1][0]) &&
            Math.min(ln[0][1], ln[1][1]) <= p[1] &&
            p[1] <= Math.max(ln[0][1], ln[1][1])
          );
        }
        if (onSeg([x, y], ln0) && onSeg([x, y], ln1)) {
          return [x, y];
        }
        return false;
      }
      function ptInPoly(pt, plist) {
        var scount = 0;
        for (var i = 0; i < plist.length; i++) {
          var np = plist[i != plist.length - 1 ? i + 1 : 0];
          var sect = intersect(
            [plist[i], np],
            [pt, [pt[0] + 999, pt[1] + 999]],
          );
          if (sect != false) {
            scount++;
          }
        }
        return scount % 2 == 1;
      }
      function lnInPoly(ln, plist) {
        var lnc = [[0, 0], [0, 0]];
        var ep = 0.01;

        lnc[0][0] = ln[0][0] * (1 - ep) + ln[1][0] * ep;
        lnc[0][1] = ln[0][1] * (1 - ep) + ln[1][1] * ep;
        lnc[1][0] = ln[0][0] * ep + ln[1][0] * (1 - ep);
        lnc[1][1] = ln[0][1] * ep + ln[1][1] * (1 - ep);

        for (var i = 0; i < plist.length; i++) {
          var pt = plist[i];
          var np = plist[i != plist.length - 1 ? i + 1 : 0];
          if (intersect(lnc, [pt, np]) != false) {
            return false;
          }
        }
        var mid = PolyTools.midPt(ln);
        if (ptInPoly(mid, plist) == false) {
          return false;
        }
        return true;
      }

      function sidesOf(plist) {
        var slist = [];
        for (var i = 0; i < plist.length; i++) {
          var pt = plist[i];
          var np = plist[i != plist.length - 1 ? i + 1 : 0];
          var s = Math.sqrt(
            Math.pow(np[0] - pt[0], 2) + Math.pow(np[1] - pt[1], 2),
          );
          slist.push(s);
        }
        return slist;
      }
      function areaOf(plist) {
        var slist = sidesOf(plist);
        var a = slist[0],
          b = slist[1],
          c = slist[2];
        var s = (a + b + c) / 2;
        return Math.sqrt(s * (s - a) * (s - b) * (s - c));
      }
      function sliverRatio(plist) {
        var A = areaOf(plist);
        var P = sidesOf(plist).reduce(function(m, n) {
          return m + n;
        }, 0);
        return A / P;
      }
      function bestEar(plist) {
        var cuts = [];
        for (var i = 0; i < plist.length; i++) {
          var pt = plist[i];
          var lp = plist[i != 0 ? i - 1 : plist.length - 1];
          var np = plist[i != plist.length - 1 ? i + 1 : 0];
          var qlist = plist.slice();
          qlist.splice(i, 1);
          if (convex || lnInPoly([lp, np], plist)) {
            var c = [[lp, pt, np], qlist];
            if (!optimize) return c;
            cuts.push(c);
          }
        }
        var best = [plist, []];
        var bestRatio = 0;
        for (var i = 0; i < cuts.length; i++) {
          var r = sliverRatio(cuts[i][0]);
          if (r >= bestRatio) {
            best = cuts[i];
            bestRatio = r;
          }
        }
        return best;
      }
      function shatter(plist, a) {
        if (plist.length == 0) {
          return [];
        }
        if (areaOf(plist) < a) {
          return [plist];
        } else {
          var slist = sidesOf(plist);
          var ind = slist.reduce(
            (iMax, x, i, arr) => (x > arr[iMax] ? i : iMax),
            0,
          );
          var nind = (ind + 1) % plist.length;
          var lind = (ind + 2) % plist.length;
          try {
            var mid = PolyTools.midPt([plist[ind], plist[nind]]);
          } catch (err) {
            console.log(plist);
            console.log(err);
            return [];
          }
          return shatter([plist[ind], mid, plist[lind]], a).concat(
            shatter([plist[lind], plist[nind], mid], a),
          );
        }
      }
      if (plist.length <= 3) {
        return shatter(plist, area);
      } else {
        var cut = bestEar(plist);
        return shatter(cut[0], area).concat(
          PolyTools.triangulate(cut[1], args),
        );
      }
    };
  }();


  function unNan(plist) {
    if (typeof plist != "object" || plist == null) {
      return plist || 0;
    } else {
      return plist.map(unNan);
    }
  }
  //console.log(unNan([[undefined,[NaN,NaN],null],false,1]))

  function distance(p0, p1) {
    return Math.sqrt(Math.pow(p0[0] - p1[0], 2) + Math.pow(p0[1] - p1[1], 2));
  }

  function mapval(value, istart, istop, ostart, ostop) {
    return (
      ostart + (ostop - ostart) * (((value - istart) * 1.0) / (istop - istart))
    );
  }
  function loopNoise(nslist) {
    var dif = nslist[nslist.length - 1] - nslist[0];
    var bds = [100, -100];
    for (var i = 0; i < nslist.length; i++) {
      nslist[i] += (dif * (nslist.length - 1 - i)) / (nslist.length - 1);
      if (nslist[i] < bds[0]) bds[0] = nslist[i];
      if (nslist[i] > bds[1]) bds[1] = nslist[i];
    }
    for (var i = 0; i < nslist.length; i++) {
      nslist[i] = mapval(nslist[i], bds[0], bds[1], 0, 1);
    }
  }

  function randChoice(arr) {
    return arr[Math.floor(arr.length * Math.random())];
  }

  function normRand(m, M) {
    return mapval(Math.random(), 0, 1, m, M);
  }

  function wtrand(func) {
    var x = Math.random();
    var y = Math.random();
    if (y < func(x)) {
      return x;
    } else {
      return wtrand(func);
    }
  }

  function randGaussian() {
    return (
      wtrand(function(x) {
        return Math.pow(Math.E, -24 * Math.pow(x - 0.5, 2));
      }) *
        2 -
      1
    );
  }

  function bezmh(P, w) {
    w = w == undefined ? 1 : w;
    if (P.length == 2) {
      P = [P[0], PolyTools.midPt(P[0], P[1]), P[1]];
    }
    var plist = [];
    for (var j = 0; j < P.length - 2; j++) {
      var p0;
      var p1;
      var p2;
      if (j == 0) {
        p0 = P[j];
      } else {
        p0 = PolyTools.midPt(P[j], P[j + 1]);
      }
      p1 = P[j + 1];
      if (j == P.length - 3) {
        p2 = P[j + 2];
      } else {
        p2 = PolyTools.midPt(P[j + 1], P[j + 2]);
      }
      var pl = 20;
      for (var i = 0; i < pl + (j == P.length - 3); i += 1) {
        var t = i / pl;
        var u = Math.pow(1 - t, 2) + 2 * t * (1 - t) * w + t * t;
        plist.push([
          (Math.pow(1 - t, 2) * p0[0] +
            2 * t * (1 - t) * p1[0] * w +
            t * t * p2[0]) /
            u,
          (Math.pow(1 - t, 2) * p0[1] +
            2 * t * (1 - t) * p1[1] * w +
            t * t * p2[1]) /
            u,
        ]);
      }
    }
    return plist;
  }

  function poly(plist, args) {
    var args = args != undefined ? args : {};
    var xof = args.xof != undefined ? args.xof : 0;
    var yof = args.yof != undefined ? args.yof : 0;
    var fil = args.fil != undefined ? args.fil : "rgba(0,0,0,0)";
    var str = args.str != undefined ? args.str : fil;
    var wid = args.wid != undefined ? args.wid : 0;

    var canv = "<polyline points='";
    for (var i = 0; i < plist.length; i++) {
      canv +=
        " " +
        (plist[i][0] + xof).toFixed(1) +
        "," +
        (plist[i][1] + yof).toFixed(1);
    }
    canv +=
      "' style='fill:" +
      fil +
      ";stroke:" +
      str +
      ";stroke-width:" +
      wid +
      "'/>";
    return canv;
  }


  console.log("************************************************");

  function stroke(ptlist, args) {
    var args = args != undefined ? args : {};
    var xof = args.xof != undefined ? args.xof : 0;
    var yof = args.yof != undefined ? args.yof : 0;
    var wid = args.wid != undefined ? args.wid : 2;
    var col = args.col != undefined ? args.col : "rgba(200,200,200,0.9)";
    var noi = args.noi != undefined ? args.noi : 0.5;
    var out = args.out != undefined ? args.out : 1;
    var fun =
      args.fun != undefined
        ? args.fun
        : function(x) {
            return Math.sin(x * Math.PI);
          };

    if (ptlist.length == 0) {
      return "";
    }
    vtxlist0 = [];
    vtxlist1 = [];
    vtxlist = [];
    var n0 = Math.random() * 10;
    for (var i = 1; i < ptlist.length - 1; i++) {
      var w = wid * fun(i / ptlist.length);
      w = w * (1 - noi) + w * noi * Noise.noise(i * 0.5, n0);
      var a1 = Math.atan2(
        ptlist[i][1] - ptlist[i - 1][1],
        ptlist[i][0] - ptlist[i - 1][0],
      );
      var a2 = Math.atan2(
        ptlist[i][1] - ptlist[i + 1][1],
        ptlist[i][0] - ptlist[i + 1][0],
      );
      var a = (a1 + a2) / 2;
      if (a < a2) {
        a += Math.PI;
      }
      vtxlist0.push([
        ptlist[i][0] + w * Math.cos(a),
        ptlist[i][1] + w * Math.sin(a),
      ]);
      vtxlist1.push([
        ptlist[i][0] - w * Math.cos(a),
        ptlist[i][1] - w * Math.sin(a),
      ]);
    }

    vtxlist = [ptlist[0]]
      .concat(
        vtxlist0.concat(vtxlist1.concat([ptlist[ptlist.length - 1]]).reverse()),
      )
      .concat([ptlist[0]]);

    var canv = poly(
      vtxlist.map(function(x) {
        return [x[0] + xof, x[1] + yof];
      }),
      { fil: col, str: col, wid: out },
    );
    return canv;
  }

  function blob(x, y, args) {
    var args = args != undefined ? args : {};
    var len = args.len != undefined ? args.len : 20;
    var wid = args.wid != undefined ? args.wid : 5;
    var ang = args.ang != undefined ? args.ang : 0;
    var col = args.col != undefined ? args.col : "rgba(200,200,200,0.9)";
    var noi = args.noi != undefined ? args.noi : 0.5;
    var ret = args.ret != undefined ? args.ret : 0;
    var fun =
      args.fun != undefined
        ? args.fun
        : function(x) {
            return x <= 1
              ? Math.pow(Math.sin(x * Math.PI), 0.5)
              : -Math.pow(Math.sin((x + 1) * Math.PI), 0.5);
          };

    var reso = 20.0;
    var lalist = [];
    for (var i = 0; i < reso + 1; i++) {
      var p = (i / reso) * 2;
      var xo = len / 2 - Math.abs(p - 1) * len;
      var yo = (fun(p) * wid) / 2;
      var a = Math.atan2(yo, xo);
      var l = Math.sqrt(xo * xo + yo * yo);
      lalist.push([l, a]);
    }
    var nslist = [];
    var n0 = Math.random() * 10;
    for (var i = 0; i < reso + 1; i++) {
      nslist.push(Noise.noise(i * 0.05, n0));
    }

    loopNoise(nslist);
    var plist = [];
    for (var i = 0; i < lalist.length; i++) {
      var ns = nslist[i] * noi + (1 - noi);
      var nx = x + Math.cos(lalist[i][1] + ang) * lalist[i][0] * ns;
      var ny = y + Math.sin(lalist[i][1] + ang) * lalist[i][0] * ns;
      plist.push([nx, ny]);
    }

    if (ret == 0) {
      return poly(plist, { fil: col, str: col, wid: 0 });
    } else {
      return plist;
    }
  }

  function div(plist, reso) {
    var tl = (plist.length - 1) * reso;
    var lx = 0;
    var ly = 0;
    var rlist = [];

    for (var i = 0; i < tl; i += 1) {
      var lastp = plist[Math.floor(i / reso)];
      var nextp = plist[Math.ceil(i / reso)];
      var p = (i % reso) / reso;
      var nx = lastp[0] * (1 - p) + nextp[0] * p;
      var ny = lastp[1] * (1 - p) + nextp[1] * p;

      var ang = Math.atan2(ny - ly, nx - lx);

      rlist.push([nx, ny]);
      lx = nx;
      ly = ny;
    }

    if (plist.length > 0) {
      rlist.push(plist[plist.length - 1]);
    }
    return rlist;
  }

  var texture = function(ptlist, args) {
    var args = args != undefined ? args : {};
    var xof = args.xof != undefined ? args.xof : 0;
    var yof = args.yof != undefined ? args.yof : 0;
    var tex = args.tex != undefined ? args.tex : 400;
    var wid = args.wid != undefined ? args.wid : 1.5;
    var len = args.len != undefined ? args.len : 0.2;
    var sha = args.sha != undefined ? args.sha : 0;
    var ret = args.ret != undefined ? args.ret : 0;
    var noi =
      args.noi != undefined
        ? args.noi
        : function(x) {
            return 30 / x;
          };
    var col =
      args.col != undefined
        ? args.col
        : function(x) {
            return "rgba(100,100,100," + (Math.random() * 0.3).toFixed(3) + ")";
          };
    var dis =
      args.dis != undefined
        ? args.dis
        : function() {
            if (Math.random() > 0.5) {
              return (1 / 3) * Math.random();
            } else {
              return (1 * 2) / 3 + (1 / 3) * Math.random();
            }
          };
    var reso = [ptlist.length, ptlist[0].length];
    var texlist = [];
    for (var i = 0; i < tex; i++) {
      var mid = (dis() * reso[1]) | 0;
      //mid = (reso[1]/3+reso[1]/3*Math.random())|0

      var hlen = Math.floor(Math.random() * (reso[1] * len));

      var start = mid - hlen;
      var end = mid + hlen;
      start = Math.min(Math.max(start, 0), reso[1]);
      end = Math.min(Math.max(end, 0), reso[1]);

      var layer = (i / tex) * (reso[0] - 1);

      texlist.push([]);
      for (var j = start; j < end; j++) {
        var p = layer - Math.floor(layer);

        var x =
          ptlist[Math.floor(layer)][j][0] * p +
          ptlist[Math.ceil(layer)][j][0] * (1 - p);

        var y =
          ptlist[Math.floor(layer)][j][1] * p +
          ptlist[Math.ceil(layer)][j][1] * (1 - p);

        var ns = [
          noi(layer + 1) * (Noise.noise(x, j * 0.5) - 0.5),
          noi(layer + 1) * (Noise.noise(y, j * 0.5) - 0.5),
        ];

        texlist[texlist.length - 1].push([x + ns[0], y + ns[1]]);
      }
    }
    var canv = "";
    //SHADE
    if (sha) {
      for (var j = 0; j < texlist.length; j += 1 + (sha != 0)) {
        canv += stroke(
          texlist[j].map(function(x) {
            return [x[0] + xof, x[1] + yof];
          }),
          { col: "rgba(100,100,100,0.1)", wid: sha },
        );
      }
    }
    //TEXTURE
    for (var j = 0 + sha; j < texlist.length; j += 1 + sha) {
      canv += stroke(
        texlist[j].map(function(x) {
          return [x[0] + xof, x[1] + yof];
        }),
        { col: col(j / texlist.length), wid: wid },
      );
    }
    return ret ? texlist : canv;
  };

  var Tree = new function() {
    this.tree01 = function(x, y, args) {
      var args = args != undefined ? args : {};
      var hei = args.hei != undefined ? args.hei : 50;
      var wid = args.wid != undefined ? args.wid : 3;
      var col = args.col != undefined ? args.col : "rgba(100,100,100,0.5)";
      var noi = args.noi != undefined ? args.noi : 0.5;

      reso = 10;
      var nslist = [];
      for (var i = 0; i < reso; i++) {
        nslist.push([Noise.noise(i * 0.5), Noise.noise(i * 0.5, 0.5)]);
      }

      var leafcol;
      if (col.includes("rgba(")) {
        leafcol = col
          .replace("rgba(", "")
          .replace(")", "")
          .split(",");
      } else {
        leafcol = ["100", "100", "100", "0.5"];
      }
      var canv = "";
      var line1 = [];
      var line2 = [];
      for (var i = 0; i < reso; i++) {
        var nx = x;
        var ny = y - (i * hei) / reso;
        if (i >= reso / 4) {
          for (var j = 0; j < (reso - i) / 5; j++) {
            canv += blob(
              nx + (Math.random() - 0.5) * wid * 1.2 * (reso - i),
              ny + (Math.random() - 0.5) * wid,
              {
                len: Math.random() * 20 * (reso - i) * 0.2 + 10,
                wid: Math.random() * 6 + 3,
                ang: ((Math.random() - 0.5) * Math.PI) / 6,
                col:
                  "rgba(" +
                  leafcol[0] +
                  "," +
                  leafcol[1] +
                  "," +
                  leafcol[2] +
                  "," +
                  (Math.random() * 0.2 + parseFloat(leafcol[3])).toFixed(1) +
                  ")",
              },
            );
          }
        }
        line1.push([nx + (nslist[i][0] - 0.5) * wid - wid / 2, ny]);
        line2.push([nx + (nslist[i][1] - 0.5) * wid + wid / 2, ny]);
      }
      canv +=
        poly(line1, { fil: "none", str: col, wid: 1.5 }) +
        poly(line2, { fil: "none", str: col, wid: 1.5 });
      return canv;
    };
    this.tree02 = function(x, y, args) {
      var args = args != undefined ? args : {};
      var hei = args.hei != undefined ? args.hei : 16;
      var wid = args.wid != undefined ? args.wid : 8;
      var clu = args.clu != undefined ? args.clu : 5;
      var col = args.col != undefined ? args.col : "rgba(100,100,100,0.5)";
      var noi = args.noi != undefined ? args.noi : 0.5;

      var leafcol;
      if (col.includes("rgba(")) {
        leafcol = col
          .replace("rgba(", "")
          .replace(")", "")
          .split(",");
      } else {
        leafcol = ["100", "100", "100", "0.5"];
      }

      var canv = "";
      for (var i = 0; i < clu; i++) {
        canv += blob(
          x + randGaussian() * clu * 4,
          y + randGaussian() * clu * 4,
          {
            ang: Math.PI / 2,
            col: "rgba(100,100,100,0.8)",
            fun: function(x) {
              return x <= 1
                ? Math.pow(Math.sin(x * Math.PI) * x, 0.5)
                : -Math.pow(Math.sin((x - 2) * Math.PI * (x - 2)), 0.5);
            },
            wid: Math.random() * wid * 0.75 + wid * 0.5,
            len: Math.random() * hei * 0.75 + hei * 0.5,
            col: col,
          },
        );
      }
      return canv;
    };
    this.tree03 = function(x, y, args) {
      var args = args != undefined ? args : {};
      var hei = args.hei != undefined ? args.hei : 50;
      var wid = args.wid != undefined ? args.wid : 5;
      var ben =
        args.ben != undefined
          ? args.ben
          : function(x) {
              return 0;
            };
      var col = args.col != undefined ? args.col : "rgba(100,100,100,0.5)";
      var noi = args.noi != undefined ? args.noi : 0.5;

      reso = 10;
      var nslist = [];
      for (var i = 0; i < reso; i++) {
        nslist.push([Noise.noise(i * 0.5), Noise.noise(i * 0.5, 0.5)]);
      }

      var leafcol;
      if (col.includes("rgba(")) {
        leafcol = col
          .replace("rgba(", "")
          .replace(")", "")
          .split(",");
      } else {
        leafcol = ["100", "100", "100", "0.5"];
      }
      var canv = "";
      var blobs = "";
      var line1 = [];
      var line2 = [];
      for (var i = 0; i < reso; i++) {
        var nx = x + ben(i / reso) * 100;
        var ny = y - (i * hei) / reso;
        if (i >= reso / 5) {
          for (var j = 0; j < (reso - i) * 2; j++) {
            var shape = function(x) {
              return Math.log(50 * x + 1) / 3.95;
            };
            var ox = Math.random() * wid * 2 * shape((reso - i) / reso);
            blobs += blob(
              nx + ox * randChoice([-1, 1]),
              ny + (Math.random() - 0.5) * wid * 2,
              {
                len: ox * 2,
                wid: Math.random() * 6 + 3,
                ang: ((Math.random() - 0.5) * Math.PI) / 6,
                col:
                  "rgba(" +
                  leafcol[0] +
                  "," +
                  leafcol[1] +
                  "," +
                  leafcol[2] +
                  "," +
                  (Math.random() * 0.2 + parseFloat(leafcol[3])).toFixed(3) +
                  ")",
              },
            );
          }
        }
        line1.push([
          nx + (((nslist[i][0] - 0.5) * wid - wid / 2) * (reso - i)) / reso,
          ny,
        ]);
        line2.push([
          nx + (((nslist[i][1] - 0.5) * wid + wid / 2) * (reso - i)) / reso,
          ny,
        ]);
      }
      var lc = line1.concat(line2.reverse());
      canv += poly(lc, { fil: "white", str: col, wid: 1.5 });
      canv += blobs;
      return canv;
    };

    var branch = function(args) {
      var args = args != undefined ? args : {};
      var hei = args.hei != undefined ? args.hei : 300;
      var wid = args.wid != undefined ? args.wid : 6;
      var ang = args.ang != undefined ? args.ang : 0;
      var det = args.det != undefined ? args.det : 10;
      var ben = args.ben != undefined ? args.ben : Math.PI * 0.2;

      var tlist;
      var nx = 0;
      var ny = 0;
      tlist = [[nx, ny]];
      var a0 = 0;
      var g = 3;
      for (var i = 0; i < g; i++) {
        a0 += (ben / 2 + (Math.random() * ben) / 2) * randChoice([-1, 1]);
        nx += (Math.cos(a0) * hei) / g;
        ny -= (Math.sin(a0) * hei) / g;
        tlist.push([nx, ny]);
      }
      var ta = Math.atan2(
        tlist[tlist.length - 1][1],
        tlist[tlist.length - 1][0],
      );

      for (var i = 0; i < tlist.length; i++) {
        var a = Math.atan2(tlist[i][1], tlist[i][0]);
        var d = Math.sqrt(
          tlist[i][0] * tlist[i][0] + tlist[i][1] * tlist[i][1],
        );
        tlist[i][0] = d * Math.cos(a - ta + ang);
        tlist[i][1] = d * Math.sin(a - ta + ang);
      }

      var trlist1 = [];
      var trlist2 = [];
      var span = det;
      var tl = (tlist.length - 1) * span;
      var lx = 0;
      var ly = 0;

      for (var i = 0; i < tl; i += 1) {
        var lastp = tlist[Math.floor(i / span)];
        var nextp = tlist[Math.ceil(i / span)];
        var p = (i % span) / span;
        var nx = lastp[0] * (1 - p) + nextp[0] * p;
        var ny = lastp[1] * (1 - p) + nextp[1] * p;

        var ang = Math.atan2(ny - ly, nx - lx);
        var woff = ((Noise.noise(i * 0.3) - 0.5) * wid * hei) / 80;

        var b = 0;
        if (p == 0) {
          b = Math.random() * wid;
        }

        var nw = wid * (((tl - i) / tl) * 0.5 + 0.5);
        trlist1.push([
          nx + Math.cos(ang + Math.PI / 2) * (nw + woff + b),
          ny + Math.sin(ang + Math.PI / 2) * (nw + woff + b),
        ]);
        trlist2.push([
          nx + Math.cos(ang - Math.PI / 2) * (nw - woff + b),
          ny + Math.sin(ang - Math.PI / 2) * (nw - woff + b),
        ]);
        lx = nx;
        ly = ny;
      }

      return [trlist1, trlist2];
    };

    var twig = function(tx, ty, dep, args) {
      var args = args != undefined ? args : {};
      var dir = args.dir != undefined ? args.dir : 1;
      var sca = args.sca != undefined ? args.sca : 1;
      var wid = args.wid != undefined ? args.wid : 1;
      var ang = args.ang != undefined ? args.ang : 0;
      var lea = args.lea != undefined ? args.lea : [true, 12];

      var canv = "";
      var twlist = [];
      var tl = 10;
      var hs = Math.random() * 0.5 + 0.5;
      var fun1 = function(x) {
        return Math.pow(x, 0.5);
      };
      var fun2 = function(x) {
        return -1 / Math.pow(i / tl + 1, 5) + 1;
      };

      var tfun = randChoice([fun2]);
      var a0 = ((Math.random() * Math.PI) / 6) * dir + ang;
      for (var i = 0; i < tl; i++) {
        var mx = dir * tfun(i / tl) * 50 * sca * hs;
        var my = -i * 5 * sca;

        var a = Math.atan2(my, mx);
        var d = Math.pow(mx * mx + my * my, 0.5);

        var nx = Math.cos(a + a0) * d;
        var ny = Math.sin(a + a0) * d;

        twlist.push([nx + tx, ny + ty]);
        if ((i == ((tl / 3) | 0) || i == (((tl * 2) / 3) | 0)) && dep > 0) {
          canv += twig(nx + tx, ny + ty, dep - 1, {
            ang: ang,
            sca: sca * 0.8,
            wid: wid,
            dir: dir * randChoice([-1, 1]),
            lea: lea,
          });
        }
        if (i == tl - 1 && lea[0] == true) {
          for (var j = 0; j < 5; j++) {
            var dj = (j - 2.5) * 5;
            canv += blob(
              nx + tx + Math.cos(ang) * dj * wid,
              ny + ty + (Math.sin(ang) * dj - lea[1] / (dep + 1)) * wid,
              {
                wid: (6 + 3 * Math.random()) * wid,
                len: (15 + 12 * Math.random()) * wid,
                ang:
                  ang / 2 + Math.PI / 2 + Math.PI * 0.2 * (Math.random() - 0.5),
                col: "rgba(100,100,100," + (0.5 + dep * 0.2).toFixed(3) + ")",
                fun: function(x) {
                  return x <= 1
                    ? Math.pow(Math.sin(x * Math.PI) * x, 0.5)
                    : -Math.pow(Math.sin((x - 2) * Math.PI * (x - 2)), 0.5);
                },
              },
            );
          }
        }
      }
      canv += stroke(twlist, {
        wid: 1,
        fun: function(x) {
          return Math.cos((x * Math.PI) / 2);
        },
        col: "rgba(100,100,100,0.5)",
      });
      return canv;
    };

    var barkify = function(x, y, trlist) {
      function bark(x, y, wid, ang) {
        var len = 10 + 10 * Math.random();
        var noi = 0.5;
        var fun = function(x) {
          return x <= 1
            ? Math.pow(Math.sin(x * Math.PI), 0.5)
            : -Math.pow(Math.sin((x + 1) * Math.PI), 0.5);
        };
        var reso = 20.0;
        var canv = "";

        var lalist = [];
        for (var i = 0; i < reso + 1; i++) {
          var p = (i / reso) * 2;
          var xo = len / 2 - Math.abs(p - 1) * len;
          var yo = (fun(p) * wid) / 2;
          var a = Math.atan2(yo, xo);
          var l = Math.sqrt(xo * xo + yo * yo);
          lalist.push([l, a]);
        }
        var nslist = [];
        var n0 = Math.random() * 10;
        for (var i = 0; i < reso + 1; i++) {
          nslist.push(Noise.noise(i * 0.05, n0));
        }

        loopNoise(nslist);
        var brklist = [];
        for (var i = 0; i < lalist.length; i++) {
          var ns = nslist[i] * noi + (1 - noi);
          var nx = x + Math.cos(lalist[i][1] + ang) * lalist[i][0] * ns;
          var ny = y + Math.sin(lalist[i][1] + ang) * lalist[i][0] * ns;
          brklist.push([nx, ny]);
        }
        var fr = Math.random();
        canv += stroke(brklist, {
          wid: 0.8,
          noi: 0,
          col: "rgba(100,100,100,0.4)",
          out: 0,
          fun: function(x) {
            return Math.sin((x + fr) * Math.PI * 3);
          },
        });

        return canv;
      }
      var canv = "";

      for (var i = 2; i < trlist[0].length - 1; i++) {
        var a0 = Math.atan2(
          trlist[0][i][1] - trlist[0][i - 1][1],
          trlist[0][i][0] - trlist[0][i - 1][0],
        );
        var a1 = Math.atan2(
          trlist[1][i][1] - trlist[1][i - 1][1],
          trlist[1][i][0] - trlist[1][i - 1][0],
        );
        var p = Math.random();
        var nx = trlist[0][i][0] * (1 - p) + trlist[1][i][0] * p;
        var ny = trlist[0][i][1] * (1 - p) + trlist[1][i][1] * p;
        if (Math.random() < 0.2) {
          canv += blob(nx + x, ny + y, {
            noi: 1,
            len: 15,
            wid: 6 - Math.abs(p - 0.5) * 10,
            ang: (a0 + a1) / 2,
            col: "rgba(100,100,100,0.6)",
          });
        } else {
          canv += bark(
            nx + x,
            ny + y,
            5 - Math.abs(p - 0.5) * 10,
            (a0 + a1) / 2,
          );
        }

        if (Math.random() < 0.05) {
          var jl = Math.random() * 2 + 2;
          var xya = randChoice([
            [trlist[0][i][0], trlist[0][i][1], a0],
            [trlist[1][i][0], trlist[1][i][1], a1],
          ]);
          for (var j = 0; j < jl; j++) {
            canv += blob(
              xya[0] + x + Math.cos(xya[2]) * (j - jl / 2) * 4,
              xya[1] + y + Math.sin(xya[2]) * (j - jl / 2) * 4,
              {
                wid: 4,
                len: 4 + 6 * Math.random(),
                ang: a0 + Math.PI / 2,
                col: "rgba(100,100,100,0.6)",
              },
            );
          }
        }
      }
      var trflist = trlist[0].concat(trlist[1].slice().reverse());
      var rglist = [[]];
      for (var i = 0; i < trflist.length; i++) {
        if (Math.random() < 0.5) {
          rglist.push([]);
        } else {
          rglist[rglist.length - 1].push(trflist[i]);
        }
      }

      for (var i = 0; i < rglist.length; i++) {
        rglist[i] = div(rglist[i], 4);
        for (var j = 0; j < rglist[i].length; j++) {
          rglist[i][j][0] +=
            (Noise.noise(i, j * 0.1, 1) - 0.5) * (15 + 5 * randGaussian());
          rglist[i][j][1] +=
            (Noise.noise(i, j * 0.1, 2) - 0.5) * (15 + 5 * randGaussian());
        }
        canv += stroke(
          rglist[i].map(function(v) {
            return [v[0] + x, v[1] + y];
          }),
          { wid: 1.5, col: "rgba(100,100,100,0.7)", out: 0 },
        );
      }
      return canv;
    };

    this.tree04 = function(x, y, args) {
      var args = args != undefined ? args : {};
      var hei = args.hei != undefined ? args.hei : 300;
      var wid = args.wid != undefined ? args.wid : 6;
      var col = args.col != undefined ? args.col : "rgba(100,100,100,0.5)";
      var noi = args.noi != undefined ? args.noi : 0.5;

      var canv = "";
      var txcanv = "";
      var twcanv = "";

      var trlist = branch({ hei: hei, wid: wid, ang: -Math.PI / 2 });
      txcanv += barkify(x, y, trlist);
      trlist = trlist[0].concat(trlist[1].reverse());

      var trmlist = [];

      for (var i = 0; i < trlist.length; i++) {
        if (
          (i >= trlist.length * 0.3 &&
            i <= trlist.length * 0.7 &&
            Math.random() < 0.1) ||
          i == trlist.length / 2 - 1
        ) {
          var ba = Math.PI * 0.2 - Math.PI * 1.4 * (i > trlist.length / 2);
          var brlist = branch({
            hei: hei * (Math.random() + 1) * 0.3,
            wid: wid * 0.5,
            ang: ba,
          });

          brlist[0].splice(0, 1);
          brlist[1].splice(0, 1);
          var foff = function(v) {
            return [v[0] + trlist[i][0], v[1] + trlist[i][1]];
          };
          txcanv += barkify(x, y, [brlist[0].map(foff), brlist[1].map(foff)]);

          for (var j = 0; j < brlist[0].length; j++) {
            if (Math.random() < 0.2 || j == brlist[0].length - 1) {
              twcanv += twig(
                brlist[0][j][0] + trlist[i][0] + x,
                brlist[0][j][1] + trlist[i][1] + y,
                1,
                {
                  wid: hei / 300,
                  ang: ba > -Math.PI / 2 ? ba : ba + Math.PI,
                  sca: (0.5 * hei) / 300,
                  dir: ba > -Math.PI / 2 ? 1 : -1,
                },
              );
            }
          }
          brlist = brlist[0].concat(brlist[1].reverse());
          trmlist = trmlist.concat(
            brlist.map(function(v) {
              return [v[0] + trlist[i][0], v[1] + trlist[i][1]];
            }),
          );
        } else {
          trmlist.push(trlist[i]);
        }
      }
      canv += poly(trmlist, { xof: x, yof: y, fil: "white", str: col, wid: 0 });

      trmlist.splice(0, 1);
      trmlist.splice(trmlist.length - 1, 1);
      canv += stroke(
        trmlist.map(function(v) {
          return [v[0] + x, v[1] + y];
        }),
        {
          col:
            "rgba(100,100,100," + (0.4 + Math.random() * 0.1).toFixed(3) + ")",
          wid: 2.5,
          fun: function(x) {
            return Math.sin(1);
          },
          noi: 0.9,
          out: 0,
        },
      );

      canv += txcanv;
      canv += twcanv;
      return canv;
    };

    this.tree05 = function(x, y, args) {
      var args = args != undefined ? args : {};
      var hei = args.hei != undefined ? args.hei : 300;
      var wid = args.wid != undefined ? args.wid : 5;
      var col = args.col != undefined ? args.col : "rgba(100,100,100,0.5)";
      var noi = args.noi != undefined ? args.noi : 0.5;

      var canv = "";
      var txcanv = "";
      var twcanv = "";

      var trlist = branch({ hei: hei, wid: wid, ang: -Math.PI / 2, ben: 0 });
      txcanv += barkify(x, y, trlist);
      trlist = trlist[0].concat(trlist[1].reverse());

      var trmlist = [];

      for (var i = 0; i < trlist.length; i++) {
        var p = Math.abs(i - trlist.length * 0.5) / (trlist.length * 0.5);
        if (
          (i >= trlist.length * 0.2 &&
            i <= trlist.length * 0.8 &&
            i % 3 == 0 &&
            Math.random() > p) ||
          i == trlist.length / 2 - 1
        ) {
          var bar = Math.random() * 0.2;
          var ba =
            -bar * Math.PI - (1 - bar * 2) * Math.PI * (i > trlist.length / 2);
          var brlist = branch({
            hei: hei * (0.3 * p - Math.random() * 0.05),
            wid: wid * 0.5,
            ang: ba,
            ben: 0.5,
          });

          brlist[0].splice(0, 1);
          brlist[1].splice(0, 1);
          var foff = function(v) {
            return [v[0] + trlist[i][0], v[1] + trlist[i][1]];
          };
          //txcanv += barkify(x,y,[brlist[0].map(foff),brlist[1].map(foff)])

          for (var j = 0; j < brlist[0].length; j++) {
            if (j % 20 == 0 || j == brlist[0].length - 1) {
              twcanv += twig(
                brlist[0][j][0] + trlist[i][0] + x,
                brlist[0][j][1] + trlist[i][1] + y,
                0,
                {
                  wid: hei / 300,
                  ang: ba > -Math.PI / 2 ? ba : ba + Math.PI,
                  sca: (0.2 * hei) / 300,
                  dir: ba > -Math.PI / 2 ? 1 : -1,
                  lea: [true, 5],
                },
              );
            }
          }
          brlist = brlist[0].concat(brlist[1].reverse());
          trmlist = trmlist.concat(
            brlist.map(function(v) {
              return [v[0] + trlist[i][0], v[1] + trlist[i][1]];
            }),
          );
        } else {
          trmlist.push(trlist[i]);
        }
      }

      canv += poly(trmlist, { xof: x, yof: y, fil: "white", str: col, wid: 0 });

      trmlist.splice(0, 1);
      trmlist.splice(trmlist.length - 1, 1);
      canv += stroke(
        trmlist.map(function(v) {
          return [v[0] + x, v[1] + y];
        }),
        {
          col:
            "rgba(100,100,100," + (0.4 + Math.random() * 0.1).toFixed(3) + ")",
          wid: 2.5,
          fun: function(x) {
            return Math.sin(1);
          },
          noi: 0.9,
          out: 0,
        },
      );

      canv += txcanv;
      canv += twcanv;
      return canv;
    };

    this.tree06 = function(x, y, args) {
      var args = args != undefined ? args : {};
      var hei = args.hei != undefined ? args.hei : 100;
      var wid = args.wid != undefined ? args.wid : 6;
      var col = args.col != undefined ? args.col : "rgba(100,100,100,0.5)";
      var noi = args.noi != undefined ? args.noi : 0.5;

      var canv = "";
      var txcanv = "";
      var twcanv = "";

      function fracTree(xoff, yoff, dep, args) {
        var args = args != undefined ? args : {};
        var hei = args.hei != undefined ? args.hei : 300;
        var wid = args.wid != undefined ? args.wid : 5;
        var ang = args.ang != undefined ? args.ang : 0;
        var ben = args.ben != undefined ? args.ben : Math.PI * 0.2;

        var trlist = branch({
          hei: hei,
          wid: wid,
          ang: ang,
          ben: ben,
          det: hei / 20,
        });
        txcanv += barkify(xoff, yoff, trlist);
        trlist = trlist[0].concat(trlist[1].reverse());

        var trmlist = [];

        for (var i = 0; i < trlist.length; i++) {
          var p = Math.abs(i - trlist.length * 0.5) / (trlist.length * 0.5);
          if (
            ((Math.random() < 0.025 &&
              i >= trlist.length * 0.2 &&
              i <= trlist.length * 0.8) ||
              i == ((trlist.length / 2) | 0) - 1 ||
              i == ((trlist.length / 2) | 0) + 1) &&
            dep > 0
          ) {
            var bar = 0.02 + Math.random() * 0.08;
            var ba =
              bar * Math.PI - bar * 2 * Math.PI * (i > trlist.length / 2);

            var brlist = fracTree(
              trlist[i][0] + xoff,
              trlist[i][1] + yoff,
              dep - 1,
              {
                hei: hei * (0.7 + Math.random() * 0.2),
                wid: wid * 0.6,
                ang: ang + ba,
                ben: 0.55,
              },
            );

            for (var j = 0; j < brlist.length; j++) {
              if (Math.random() < 0.03) {
                twcanv += twig(
                  brlist[j][0] + trlist[i][0] + xoff,
                  brlist[j][1] + trlist[i][1] + yoff,
                  2,
                  {
                    ang: ba * (Math.random() * 0.5 + 0.75),
                    sca: 0.3,
                    dir: ba > 0 ? 1 : -1,
                    lea: [false, 0],
                  },
                );
              }
            }

            trmlist = trmlist.concat(
              brlist.map(function(v) {
                return [v[0] + trlist[i][0], v[1] + trlist[i][1]];
              }),
            );
          } else {
            trmlist.push(trlist[i]);
          }
        }
        return trmlist;
      }

      var trmlist = fracTree(x, y, 3, {
        hei: hei,
        wid: wid,
        ang: -Math.PI / 2,
        ben: 0,
      });

      canv += poly(trmlist, { xof: x, yof: y, fil: "white", str: col, wid: 0 });

      trmlist.splice(0, 1);
      trmlist.splice(trmlist.length - 1, 1);
      canv += stroke(
        trmlist.map(function(v) {
          return [v[0] + x, v[1] + y];
        }),
        {
          col:
            "rgba(100,100,100," + (0.4 + Math.random() * 0.1).toFixed(3) + ")",
          wid: 2.5,
          fun: function(x) {
            return Math.sin(1);
          },
          noi: 0.9,
          out: 0,
        },
      );

      canv += txcanv;
      canv += twcanv;
      return canv;
    };

    this.tree07 = function(x, y, args) {
      var args = args != undefined ? args : {};
      var hei = args.hei != undefined ? args.hei : 60;
      var wid = args.wid != undefined ? args.wid : 4;
      var ben =
        args.ben != undefined
          ? args.ben
          : function(x) {
              return Math.sqrt(x) * 0.2;
            };
      var col = args.col != undefined ? args.col : "rgba(100,100,100,1)";
      var noi = args.noi != undefined ? args.noi : 0.5;

      reso = 10;
      var nslist = [];
      for (var i = 0; i < reso; i++) {
        nslist.push([Noise.noise(i * 0.5), Noise.noise(i * 0.5, 0.5)]);
      }
      var leafcol;
      if (col.includes("rgba(")) {
        leafcol = col
          .replace("rgba(", "")
          .replace(")", "")
          .split(",");
      } else {
        leafcol = ["100", "100", "100", "1"];
      }
      var canv = "";
      var line1 = [];
      var line2 = [];
      var T = [];
      for (var i = 0; i < reso; i++) {
        var nx = x + ben(i / reso) * 100;
        var ny = y - (i * hei) / reso;
        if (i >= reso / 4) {
          for (var j = 0; j < 1; j++) {
            var bpl = blob(
              nx + (Math.random() - 0.5) * wid * 1.2 * (reso - i) * 0.5,
              ny + (Math.random() - 0.5) * wid * 0.5,
              {
                len: Math.random() * 50 + 20,
                wid: Math.random() * 12 + 12,
                ang: (-Math.random() * Math.PI) / 6,
                col:
                  "rgba(" +
                  leafcol[0] +
                  "," +
                  leafcol[1] +
                  "," +
                  leafcol[2] +
                  "," +
                  parseFloat(leafcol[3]).toFixed(3) +
                  ")",
                fun: function(x) {
                  return x <= 1
                    ? 2.75 * x * Math.pow(1 - x, 1 / 1.8)
                    : 2.75 * (x - 2) * Math.pow(x - 1, 1 / 1.8);
                },
                ret: 1,
              },
            );

            //canv+=poly(bpl,{fil:col,wid:0})
            T = T.concat(
              PolyTools.triangulate(bpl, {
                area: 50,
                convex: true,
                optimize: false,
              }),
            );
          }
        }
        line1.push([nx + (nslist[i][0] - 0.5) * wid - wid / 2, ny]);
        line2.push([nx + (nslist[i][1] - 0.5) * wid + wid / 2, ny]);
      }

      //canv += poly(line1.concat(line2.reverse()),{fil:col,wid:0})
      T = PolyTools.triangulate(line1.concat(line2.reverse()), {
        area: 50,
        convex: true,
        optimize: true,
      }).concat(T);

      for (var k = 0; k < T.length; k++) {
        var m = PolyTools.midPt(T[k]);
        var c = (Noise.noise(m[0] * 0.02, m[1] * 0.02) * 200 + 50) | 0;
        var co = "rgba(" + c + "," + c + "," + c + ",0.8)";
        canv += poly(T[k], { fil: co, str: co, wid: 0 });
      }
      return canv;
    };

    this.tree08 = function(x, y, args) {
      var args = args != undefined ? args : {};
      var hei = args.hei != undefined ? args.hei : 80;
      var wid = args.wid != undefined ? args.wid : 1;
      var col = args.col != undefined ? args.col : "rgba(100,100,100,0.5)";
      var noi = args.noi != undefined ? args.noi : 0.5;

      var canv = "";
      var txcanv = "";
      var twcanv = "";

      var ang = normRand(-1, 1) * Math.PI * 0.2;

      var trlist = branch({
        hei: hei,
        wid: wid,
        ang: -Math.PI / 2 + ang,
        ben: Math.PI * 0.2,
        det: hei / 20,
      });
      //txcanv += barkify(x,y,trlist)

      trlist = trlist[0].concat(trlist[1].reverse());

      function fracTree(xoff, yoff, dep, args) {
        var args = args != undefined ? args : {};
        var ang = args.ang != undefined ? args.ang : -Math.PI / 2;
        var len = args.len != undefined ? args.len : 15;
        var ben = args.ben != undefined ? args.ben : 0;

        var fun =
          dep == 0
            ? function(x) {
                return Math.cos(0.5 * Math.PI * x);
              }
            : function(x) {
                return 1;
              };
        var spt = [xoff, yoff];
        var ept = [xoff + Math.cos(ang) * len, yoff + Math.sin(ang) * len];

        var trmlist = [[xoff, yoff], [xoff + len, yoff]];

        var bfun = randChoice([
          function(x) {
            return Math.sin(x * Math.PI);
          },
          function(x) {
            return -Math.sin(x * Math.PI);
          },
        ]);

        trmlist = div(trmlist, 10);

        for (var i = 0; i < trmlist.length; i++) {
          trmlist[i][1] += bfun(i / trmlist.length) * 2;
        }
        for (var i = 0; i < trmlist.length; i++) {
          var d = distance(trmlist[i], spt);
          var a = Math.atan2(trmlist[i][1] - spt[1], trmlist[i][0] - spt[0]);
          trmlist[i][0] = spt[0] + d * Math.cos(a + ang);
          trmlist[i][1] = spt[1] + d * Math.sin(a + ang);
        }

        var tcanv = "";
        tcanv += stroke(trmlist, {
          fun: fun,
          wid: 0.8,
          col: "rgba(100,100,100,0.5)",
        });
        if (dep != 0) {
          var nben = ben + randChoice([-1, 1]) * Math.PI * 0.001 * dep * dep;
          if (Math.random() < 0.5) {
            tcanv += fracTree(ept[0], ept[1], dep - 1, {
              ang:
                ang +
                ben +
                Math.PI *
                  randChoice([normRand(-1, 0.5), normRand(0.5, 1)]) *
                  0.2,
              len: len * normRand(0.8, 0.9),
              ben: nben,
            });
            tcanv += fracTree(ept[0], ept[1], dep - 1, {
              ang:
                ang +
                ben +
                Math.PI *
                  randChoice([normRand(-1, -0.5), normRand(0.5, 1)]) *
                  0.2,
              len: len * normRand(0.8, 0.9),
              ben: nben,
            });
          } else {
            tcanv += fracTree(ept[0], ept[1], dep - 1, {
              ang: ang + ben,
              len: len * normRand(0.8, 0.9),
              ben: nben,
            });
          }
        }
        return tcanv;
      }

      for (var i = 0; i < trlist.length; i++) {
        if (Math.random() < 0.2) {
          twcanv += fracTree(
            x + trlist[i][0],
            y + trlist[i][1],
            Math.floor(4 * Math.random()),
            { hei: 20, ang: -Math.PI / 2 - ang * Math.random() },
          );
        } else if (i == Math.floor(trlist.length / 2)) {
          twcanv += fracTree(x + trlist[i][0], y + trlist[i][1], 3, {
            hei: 25,
            ang: -Math.PI / 2 + ang,
          });
        }
      }

      canv += poly(trlist, { xof: x, yof: y, fil: "white", str: col, wid: 0 });

      canv += stroke(
        trlist.map(function(v) {
          return [v[0] + x, v[1] + y];
        }),
        {
          col:
            "rgba(100,100,100," + (0.6 + Math.random() * 0.1).toFixed(3) + ")",
          wid: 2.5,
          fun: function(x) {
            return Math.sin(1);
          },
          noi: 0.9,
          out: 0,
        },
      );

      canv += txcanv;
      canv += twcanv;
      //console.log(canv)
      return canv;
    };
  }();

  var Mount = new function() {
    var foot = function(ptlist, args) {
      var args = args != undefined ? args : {};
      var xof = args.xof != undefined ? args.xof : 0;
      var yof = args.yof != undefined ? args.yof : 0;
      var ret = args.ret != undefined ? args.ret : 0;

      var ftlist = [];
      var span = 10;
      var ni = 0;
      for (var i = 0; i < ptlist.length - 2; i += 1) {
        if (i == ni) {
          ni = Math.min(ni + randChoice([1, 2]), ptlist.length - 1);

          ftlist.push([]);
          ftlist.push([]);
          for (var j = 0; j < Math.min(ptlist[i].length / 8, 10); j++) {
            ftlist[ftlist.length - 2].push([
              ptlist[i][j][0] + Noise.noise(j * 0.1, i) * 10,
              ptlist[i][j][1],
            ]);
            ftlist[ftlist.length - 1].push([
              ptlist[i][ptlist[i].length - 1 - j][0] -
                Noise.noise(j * 0.1, i) * 10,
              ptlist[i][ptlist[i].length - 1 - j][1],
            ]);
          }

          ftlist[ftlist.length - 2] = ftlist[ftlist.length - 2].reverse();
          ftlist[ftlist.length - 1] = ftlist[ftlist.length - 1].reverse();
          for (var j = 0; j < span; j++) {
            var p = j / span;
            var x1 = ptlist[i][0][0] * (1 - p) + ptlist[ni][0][0] * p;
            var y1 = ptlist[i][0][1] * (1 - p) + ptlist[ni][0][1] * p;

            var x2 =
              ptlist[i][ptlist[i].length - 1][0] * (1 - p) +
              ptlist[ni][ptlist[i].length - 1][0] * p;
            var y2 =
              ptlist[i][ptlist[i].length - 1][1] * (1 - p) +
              ptlist[ni][ptlist[i].length - 1][1] * p;

            var vib = -1.7 * (p - 1) * Math.pow(p, 1 / 5);
            y1 += vib * 5 + Noise.noise(xof * 0.05, i) * 5;
            y2 += vib * 5 + Noise.noise(xof * 0.05, i) * 5;

            ftlist[ftlist.length - 2].push([x1, y1]);
            ftlist[ftlist.length - 1].push([x2, y2]);
          }
        }
      }
      var canv = "";
      for (var i = 0; i < ftlist.length; i++) {
        canv += poly(ftlist[i], {
          xof: xof,
          yof: yof,
          fil: "white",
          str: "none",
        });
      }
      for (var j = 0; j < ftlist.length; j++) {
        canv += stroke(
          ftlist[j].map(function(x) {
            return [x[0] + xof, x[1] + yof];
          }),
          {
            col:
              "rgba(100,100,100," +
              (0.1 + Math.random() * 0.1).toFixed(3) +
              ")",
            wid: 1,
          },
        );
      }
      return ret ? ftlist : canv;
    };

    this.mountain = function(xoff, yoff, seed, args) {
      var args = args != undefined ? args : {};
      var hei = args.hei != undefined ? args.hei : 100 + Math.random() * 400;
      var wid = args.wid != undefined ? args.wid : 400 + Math.random() * 200;
      var tex = args.tex != undefined ? args.tex : 200;
      var veg = args.veg != undefined ? args.veg : true;
      var ret = args.ret != undefined ? args.ret : 0;
      var col = args.col != undefined ? args.col : undefined;

      seed = seed != undefined ? seed : 0;

      var canv = "";

      var ptlist = [];
      var h = hei;
      var w = wid;
      var reso = [10, 50];

      var hoff = 0;
      for (var j = 0; j < reso[0]; j++) {
        hoff += (Math.random() * yoff) / 100;
        ptlist.push([]);
        for (var i = 0; i < reso[1]; i++) {
          var x = (i / reso[1] - 0.5) * Math.PI;
          var y = Math.cos(x);
          y *= Noise.noise(x + 10, j * 0.15, seed);
          var p = 1 - j / reso[0];
          ptlist[ptlist.length - 1].push([
            (x / Math.PI) * w * p,
            -y * h * p + hoff,
          ]);
        }
      }

      function vegetate(treeFunc, growthRule, proofRule) {
        var veglist = [];
        for (var i = 0; i < ptlist.length; i += 1) {
          for (var j = 0; j < ptlist[i].length; j += 1) {
            if (growthRule(i, j)) {
              veglist.push([ptlist[i][j][0], ptlist[i][j][1]]);
            }
          }
        }
        for (var i = 0; i < veglist.length; i++) {
          if (proofRule(veglist, i)) {
            canv += treeFunc(veglist[i][0], veglist[i][1]);
          }
        }
      }
      //RIM
      vegetate(
        function(x, y) {
          return Tree.tree02(x + xoff, y + yoff - 5, {
            col:
              "rgba(100,100,100," +
              (Noise.noise(0.01 * x, 0.01 * y) * 0.5 * 0.3 + 0.5).toFixed(3) +
              ")",
            clu: 2,
          });
        },
        function(i, j) {
          var ns = Noise.noise(j * 0.1, seed);
          return (
            i == 0 && ns * ns * ns < 0.1 && Math.abs(ptlist[i][j][1]) / h > 0.2
          );
        },
        function(veglist, i) {
          return true;
        },
      );

      //WHITE BG
      canv += poly(ptlist[0].concat([[0, reso[0] * 4]]), {
        xof: xoff,
        yof: yoff,
        fil: "white",
        str: "none",
      });
      //OUTLINE
      canv += stroke(
        ptlist[0].map(function(x) {
          return [x[0] + xoff, x[1] + yoff];
        }),
        { col: "rgba(100,100,100,0.3)", noi: 1, wid: 3 },
      );

      canv += foot(ptlist, { xof: xoff, yof: yoff });
      canv += texture(ptlist, {
        xof: xoff,
        yof: yoff,
        tex: tex,
        sha: randChoice([0, 0, 0, 0, 5]),
        col: col,
      });

      //TOP
      vegetate(
        function(x, y) {
          return Tree.tree02(x + xoff, y + yoff, {
            col:
              "rgba(100,100,100," +
              (Noise.noise(0.01 * x, 0.01 * y) * 0.5 * 0.3 + 0.5).toFixed(3) +
              ")",
          });
        },
        function(i, j) {
          var ns = Noise.noise(i * 0.1, j * 0.1, seed + 2);
          return ns * ns * ns < 0.1 && Math.abs(ptlist[i][j][1]) / h > 0.5;
        },
        function(veglist, i) {
          return true;
        },
      );

      if (veg) {
        //MIDDLE
        vegetate(
          function(x, y) {
            var ht = ((h + y) / h) * 70;
            ht = ht * 0.3 + Math.random() * ht * 0.7;
            return Tree.tree01(x + xoff, y + yoff, {
              hei: ht,
              wid: Math.random() * 3 + 1,
              col:
                "rgba(100,100,100," +
                (Noise.noise(0.01 * x, 0.01 * y) * 0.5 * 0.3 + 0.3).toFixed(3) +
                ")",
            });
          },
          function(i, j) {
            var ns = Noise.noise(i * 0.2, j * 0.05, seed);
            return (
              j % 2 &&
              ns * ns * ns * ns < 0.012 &&
              Math.abs(ptlist[i][j][1]) / h < 0.3
            );
          },
          function(veglist, i) {
            var counter = 0;
            for (var j = 0; j < veglist.length; j++) {
              if (
                i != j &&
                Math.pow(veglist[i][0] - veglist[j][0], 2) +
                  Math.pow(veglist[i][1] - veglist[j][1], 2) <
                  30 * 30
              ) {
                counter++;
              }
              if (counter > 2) {
                return true;
              }
            }
            return false;
          },
        );

        //BOTTOM
        vegetate(
          function(x, y) {
            var ht = ((h + y) / h) * 120;
            ht = ht * 0.5 + Math.random() * ht * 0.5;
            var bc = Math.random() * 0.1;
            var bp = 1;
            return Tree.tree03(x + xoff, y + yoff, {
              hei: ht,
              ben: function(x) {
                return Math.pow(x * bc, bp);
              },
              col:
                "rgba(100,100,100," +
                (Noise.noise(0.01 * x, 0.01 * y) * 0.5 * 0.3 + 0.3).toFixed(3) +
                ")",
            });
          },
          function(i, j) {
            var ns = Noise.noise(i * 0.2, j * 0.05, seed);
            return (
              (j == 0 || j == ptlist[i].length - 1) && ns * ns * ns * ns < 0.012
            );
          },
          function(veglist, i) {
            return true;
          },
        );
      }

      //BOTT ARCH
      vegetate(
        function(x, y) {
          var tt = randChoice([0, 0, 1, 1, 1, 2]);
          if (tt == 1) {
            return Arch.arch02(x + xoff, y + yoff, seed, {
              wid: normRand(40, 70),
              sto: randChoice([1, 2, 2, 3]),
              rot: Math.random(),
              sty: randChoice([1, 2, 3]),
            });
          } else if (tt == 2) {
            return Arch.arch04(x + xoff, y + yoff, seed, {
              sto: randChoice([1, 1, 1, 2, 2]),
            });
          } else {
            return "";
          }
        },
        function(i, j) {
          var ns = Noise.noise(i * 0.2, j * 0.05, seed + 10);
          return (
            i != 0 &&
            (j == 1 || j == ptlist[i].length - 2) &&
            ns * ns * ns * ns < 0.008
          );
        },
        function(veglist, i) {
          return true;
        },
      );
      //TOP ARCH
      vegetate(
        function(x, y) {
          return Arch.arch03(x + xoff, y + yoff, seed, {
            sto: randChoice([5, 7]),
            wid: 40 + Math.random() * 20,
          });
        },
        function(i, j) {
          return (
            i == 1 &&
            Math.abs(j - ptlist[i].length / 2) < 1 &&
            Math.random() < 0.02
          );
        },
        function(veglist, i) {
          return true;
        },
      );

      //TRANSM
      vegetate(
        function(x, y) {
          return Arch.transmissionTower01(x + xoff, y + yoff, seed);
        },
        function(i, j) {
          var ns = Noise.noise(i * 0.2, j * 0.05, seed + 20 * Math.PI);
          return (
            i % 2 == 0 &&
            (j == 1 || j == ptlist[i].length - 2) &&
            ns * ns * ns * ns < 0.002
          );
        },
        function(veglist, i) {
          return true;
        },
      );

      //BOTT ROCK
      vegetate(
        function(x, y) {
          return Mount.rock(x + xoff, y + yoff, seed, {
            wid: 20 + Math.random() * 20,
            hei: 20 + Math.random() * 20,
            sha: 2,
          });
        },
        function(i, j) {
          return (j == 0 || j == ptlist[i].length - 1) && Math.random() < 0.1;
        },
        function(veglist, i) {
          return true;
        },
      );

      if (ret == 0) {
        return canv;
      } else {
        return [ptlist];
      }
    };

    this.flatMount = function(xoff, yoff, seed, args) {
      var args = args != undefined ? args : {};
      var hei = args.hei != undefined ? args.hei : 40 + Math.random() * 400;
      var wid = args.wid != undefined ? args.wid : 400 + Math.random() * 200;
      var tex = args.tex != undefined ? args.tex : 80;
      var cho = args.cho != undefined ? args.cho : 0.5;
      var ret = args.ret != undefined ? args.ret : 0;

      seed = seed != undefined ? seed : 0;

      var canv = "";
      var ptlist = [];
      var reso = [5, 50];
      var hoff = 0;
      var flat = [];
      for (var j = 0; j < reso[0]; j++) {
        hoff += (Math.random() * yoff) / 100;
        ptlist.push([]);
        flat.push([]);
        for (var i = 0; i < reso[1]; i++) {
          var x = (i / reso[1] - 0.5) * Math.PI;
          var y = Math.cos(x * 2) + 1;
          y *= Noise.noise(x + 10, j * 0.1, seed);
          var p = 1 - (j / reso[0]) * 0.6;
          var nx = (x / Math.PI) * wid * p;
          var ny = -y * hei * p + hoff;
          var h = 100;
          if (ny < -h * cho + hoff) {
            ny = -h * cho + hoff;
            if (flat[flat.length - 1].length % 2 == 0) {
              flat[flat.length - 1].push([nx, ny]);
            }
          } else {
            if (flat[flat.length - 1].length % 2 == 1) {
              flat[flat.length - 1].push(
                ptlist[ptlist.length - 1][ptlist[ptlist.length - 1].length - 1],
              );
            }
          }

          ptlist[ptlist.length - 1].push([nx, ny]);
        }
      }

      //WHITE BG
      canv += poly(ptlist[0].concat([[0, reso[0] * 4]]), {
        xof: xoff,
        yof: yoff,
        fil: "white",
        str: "none",
      });
      //OUTLINE
      canv += stroke(
        ptlist[0].map(function(x) {
          return [x[0] + xoff, x[1] + yoff];
        }),
        { col: "rgba(100,100,100,0.3)", noi: 1, wid: 3 },
      );

      //canv += foot(ptlist,{xof:xoff,yof:yoff})
      canv += texture(ptlist, {
        xof: xoff,
        yof: yoff,
        tex: tex,
        wid: 2,
        dis: function() {
          if (Math.random() > 0.5) {
            return 0.1 + 0.4 * Math.random();
          } else {
            return 0.9 - 0.4 * Math.random();
          }
        },
      });
      var grlist1 = [];
      var grlist2 = [];
      for (var i = 0; i < flat.length; i += 2) {
        if (flat[i].length >= 2) {
          grlist1.push(flat[i][0]);
          grlist2.push(flat[i][flat[i].length - 1]);
        }
      }

      if (grlist1.length == 0) {
        return canv;
      }
      var wb = [grlist1[0][0], grlist2[0][0]];
      for (var i = 0; i < 3; i++) {
        var p = 0.8 - i * 0.2;

        grlist1.unshift([wb[0] * p, grlist1[0][1] - 5]);
        grlist2.unshift([wb[1] * p, grlist2[0][1] - 5]);
      }
      wb = [grlist1[grlist1.length - 1][0], grlist2[grlist2.length - 1][0]];
      for (var i = 0; i < 3; i++) {
        var p = 0.6 - i * i * 0.1;
        grlist1.push([wb[0] * p, grlist1[grlist1.length - 1][1] + 1]);
        grlist2.push([wb[1] * p, grlist2[grlist2.length - 1][1] + 1]);
      }

      var d = 5;
      grlist1 = div(grlist1, d);
      grlist2 = div(grlist2, d);

      var grlist = grlist1.reverse().concat(grlist2.concat([grlist1[0]]));
      for (var i = 0; i < grlist.length; i++) {
        var v = (1 - Math.abs((i % d) - d / 2) / (d / 2)) * 0.12;
        grlist[i][0] *= 1 - v + Noise.noise(grlist[i][1] * 0.5) * v;
      }
      /*       for (var i = 0; i < ptlist.length; i++){
        canv += poly(ptlist[i],{xof:xoff,yof:yoff,str:"red",fil:"none",wid:2})
      }
 */
      canv += poly(grlist, {
        xof: xoff,
        yof: yoff,
        str: "none",
        fil: "white",
        wid: 2,
      });
      canv += stroke(grlist.map(x => [x[0] + xoff, x[1] + yoff]), {
        wid: 3,
        col: "rgba(100,100,100,0.2)",
      });

      var bound = function(plist) {
        var xmin;
        var xmax;
        var ymin;
        var ymax;
        for (var i = 0; i < plist.length; i++) {
          if (xmin == undefined || plist[i][0] < xmin) {
            xmin = plist[i][0];
          }
          if (xmax == undefined || plist[i][0] > xmax) {
            xmax = plist[i][0];
          }
          if (ymin == undefined || plist[i][1] < ymin) {
            ymin = plist[i][1];
          }
          if (ymax == undefined || plist[i][1] > ymax) {
            ymax = plist[i][1];
          }
        }
        return { xmin: xmin, xmax: xmax, ymin: ymin, ymax: ymax };
      };

      canv += this.flatDec(xoff, yoff, bound(grlist));

      return canv;
    };

    this.flatDec = function(xoff, yoff, grbd) {
      var canv = "";

      var tt = randChoice([0, 0, 1, 2, 3, 4]);

      for (var j = 0; j < Math.random() * 5; j++) {
        canv += Mount.rock(
          xoff + normRand(grbd.xmin, grbd.xmax),
          yoff + (grbd.ymin + grbd.ymax) / 2 + normRand(-10, 10) + 10,
          Math.random() * 100,
          {
            wid: 10 + Math.random() * 20,
            hei: 10 + Math.random() * 20,
            sha: 2,
          },
        );
      }
      for (var j = 0; j < randChoice([0, 0, 1, 2]); j++) {
        var xr = xoff + normRand(grbd.xmin, grbd.xmax);
        var yr = yoff + (grbd.ymin + grbd.ymax) / 2 + normRand(-5, 5) + 20;
        for (var k = 0; k < 2 + Math.random() * 3; k++) {
          canv += Tree.tree08(
            xr + Math.min(Math.max(normRand(-30, 30), grbd.xmin), grbd.xmax),
            yr,
            { hei: 60 + Math.random() * 40 },
          );
        }
      }

      if (tt == 0) {
        for (var j = 0; j < Math.random() * 3; j++) {
          canv += Mount.rock(
            xoff + normRand(grbd.xmin, grbd.xmax),
            yoff + (grbd.ymin + grbd.ymax) / 2 + normRand(-5, 5) + 20,
            Math.random() * 100,
            {
              wid: 50 + Math.random() * 20,
              hei: 40 + Math.random() * 20,
              sha: 5,
            },
          );
        }
      }
      if (tt == 1) {
        var pmin = Math.random() * 0.5;
        var pmax = Math.random() * 0.5 + 0.5;
        var xmin = grbd.xmin * (1 - pmin) + grbd.xmax * pmin;
        var xmax = grbd.xmin * (1 - pmax) + grbd.xmax * pmax;
        for (var i = xmin; i < xmax; i += 30) {
          canv += Tree.tree05(
            xoff + i + 20 * normRand(-1, 1),
            yoff + (grbd.ymin + grbd.ymax) / 2 + 20,
            { hei: 100 + Math.random() * 200 },
          );
        }
        for (var j = 0; j < Math.random() * 4; j++) {
          canv += Mount.rock(
            xoff + normRand(grbd.xmin, grbd.xmax),
            yoff + (grbd.ymin + grbd.ymax) / 2 + normRand(-5, 5) + 20,
            Math.random() * 100,
            {
              wid: 50 + Math.random() * 20,
              hei: 40 + Math.random() * 20,
              sha: 5,
            },
          );
        }
      } else if (tt == 2) {
        for (var i = 0; i < randChoice([1, 1, 1, 1, 2, 2, 3]); i++) {
          var xr = normRand(grbd.xmin, grbd.xmax);
          var yr = (grbd.ymin + grbd.ymax) / 2;
          canv += Tree.tree04(xoff + xr, yoff + yr + 20, {});
          for (var j = 0; j < Math.random() * 2; j++) {
            canv += Mount.rock(
              xoff +
                Math.max(
                  grbd.xmin,
                  Math.min(grbd.xmax, xr + normRand(-50, 50)),
                ),
              yoff + yr + normRand(-5, 5) + 20,
              j * i * Math.random() * 100,
              {
                wid: 50 + Math.random() * 20,
                hei: 40 + Math.random() * 20,
                sha: 5,
              },
            );
          }
        }
      } else if (tt == 3) {
        for (var i = 0; i < randChoice([1, 1, 1, 1, 2, 2, 3]); i++) {
          canv += Tree.tree06(
            xoff + normRand(grbd.xmin, grbd.xmax),
            yoff + (grbd.ymin + grbd.ymax) / 2,
            { hei: 60 + Math.random() * 60 },
          );
        }
      } else if (tt == 4) {
        var pmin = Math.random() * 0.5;
        var pmax = Math.random() * 0.5 + 0.5;
        var xmin = grbd.xmin * (1 - pmin) + grbd.xmax * pmin;
        var xmax = grbd.xmin * (1 - pmax) + grbd.xmax * pmax;
        for (var i = xmin; i < xmax; i += 20) {
          canv += Tree.tree07(
            xoff + i + 20 * normRand(-1, 1),
            yoff + (grbd.ymin + grbd.ymax) / 2 + normRand(-1, 1) + 0,
            { hei: normRand(40, 80) },
          );
        }
      }

      for (var i = 0; i < 50 * Math.random(); i++) {
        canv += Tree.tree02(
          xoff + normRand(grbd.xmin, grbd.xmax),
          yoff + normRand(grbd.ymin, grbd.ymax),
        );
      }

      var ts = randChoice([0, 0, 0, 0, 1]);
      if (ts == 1 && tt != 4) {
        canv += Arch.arch01(
          xoff + normRand(grbd.xmin, grbd.xmax),
          yoff + (grbd.ymin + grbd.ymax) / 2 + 20,
          Math.random(),
          {
            wid: normRand(160, 200),
            hei: normRand(80, 100),
            per: Math.random(),
          },
        );
      }

      return canv;
    };

    this.distMount = function(xoff, yoff, seed, args) {
      var args = args != undefined ? args : {};
      var hei = args.hei != undefined ? args.hei : 300;
      var len = args.len != undefined ? args.len : 2000;
      var seg = args.seg != undefined ? args.seg : 5;

      seed = seed != undefined ? seed : 0;
      var canv = "";
      var span = 10;

      var ptlist = [];

      for (var i = 0; i < len / span / seg; i++) {
        ptlist.push([]);
        for (var j = 0; j < seg + 1; j++) {
          var tran = function(k) {
            return [
              xoff + k * span,
              yoff -
                hei *
                  Noise.noise(k * 0.05, seed) *
                  Math.pow(Math.sin((Math.PI * k) / (len / span)), 0.5),
            ];
          };
          ptlist[ptlist.length - 1].push(tran(i * seg + j));
        }
        for (var j = 0; j < seg / 2 + 1; j++) {
          var tran = function(k) {
            return [
              xoff + k * span,
              yoff +
                24 *
                  Noise.noise(k * 0.05, 2, seed) *
                  Math.pow(Math.sin((Math.PI * k) / (len / span)), 1),
            ];
          };
          ptlist[ptlist.length - 1].unshift(tran(i * seg + j * 2));
        }
      }
      for (var i = 0; i < ptlist.length; i++) {
        var getCol = function(x, y) {
          var c = (Noise.noise(x * 0.02, y * 0.02, yoff) * 55 + 200) | 0;
          return "rgb(" + c + "," + c + "," + c + ")";
        };
        canv += poly(ptlist[i], {
          fil: getCol(...ptlist[i][ptlist[i].length - 1]),
          str: "none",
          wid: 1,
        });

        var T = PolyTools.triangulate(ptlist[i], {
          area: 100,
          convex: true,
          optimize: false,
        });
        for (var k = 0; k < T.length; k++) {
          var m = PolyTools.midPt(T[k]);
          var co = getCol(m[0], m[1]);
          canv += poly(T[k], { fil: co, str: co, wid: 1 });
        }
      }
      return canv;
    };

    this.rock = function(xoff, yoff, seed, args) {
      var args = args != undefined ? args : {};
      var hei = args.hei != undefined ? args.hei : 80;
      var wid = args.wid != undefined ? args.wid : 100;
      var tex = args.tex != undefined ? args.tex : 40;
      var ret = args.ret != undefined ? args.ret : 0;
      var sha = args.sha != undefined ? args.sha : 10;

      seed = seed != undefined ? seed : 0;

      var canv = "";

      var reso = [10, 50];
      var ptlist = [];

      for (var i = 0; i < reso[0]; i++) {
        ptlist.push([]);

        var nslist = [];
        for (var j = 0; j < reso[1]; j++) {
          nslist.push(Noise.noise(i, j * 0.2, seed));
        }
        loopNoise(nslist);

        for (var j = 0; j < reso[1]; j++) {
          var a = (j / reso[1]) * Math.PI * 2 - Math.PI / 2;
          var l =
            (wid * hei) /
            Math.sqrt(
              Math.pow(hei * Math.cos(a), 2) + Math.pow(wid * Math.sin(a), 2),
            );

          /*           var l = Math.sin(a)>0? Math.pow(Math.sin(a),0.1)*wid
                             : - Math.pow(Math.sin(a+Math.PI),0.1)*wid */
          l *= 0.7 + 0.3 * nslist[j];

          var p = 1 - i / reso[0];

          var nx = Math.cos(a) * l * p;
          var ny = -Math.sin(a) * l * p;

          if (Math.PI < a || a < 0) {
            ny *= 0.2;
          }

          ny += hei * (i / reso[0]) * 0.2;

          ptlist[ptlist.length - 1].push([nx, ny]);
        }
      }

      //WHITE BG
      canv += poly(ptlist[0].concat([[0, 0]]), {
        xof: xoff,
        yof: yoff,
        fil: "white",
        str: "none",
      });
      //OUTLINE
      canv += stroke(
        ptlist[0].map(function(x) {
          return [x[0] + xoff, x[1] + yoff];
        }),
        { col: "rgba(100,100,100,0.3)", noi: 1, wid: 3 },
      );
      canv += texture(ptlist, {
        xof: xoff,
        yof: yoff,
        tex: tex,
        wid: 3,
        sha: sha,
        col: function(x) {
          return (
            "rgba(180,180,180," + (0.3 + Math.random() * 0.3).toFixed(3) + ")"
          );
        },
        dis: function() {
          if (Math.random() > 0.5) {
            return 0.15 + 0.15 * Math.random();
          } else {
            return 0.85 - 0.15 * Math.random();
          }
        },
      });

      for (var i = 0; i < reso[0]; i++) {
        //canv += poly(ptlist[i],{xof:xoff,yof:yoff,fil:"none",str:"red",wid:2})
      }
      return canv;
    };
  }();

  var Arch = new function() {
    var flip = function(ptlist, axis) {
      axis = axis == undefined ? 0 : axis;
      for (var i = 0; i < ptlist.length; i++) {
        if (ptlist[i].length > 0) {
          if (typeof ptlist[i][0] == "object") {
            for (var j = 0; j < ptlist[i].length; j++) {
              ptlist[i][j][0] = axis - (ptlist[i][j][0] - axis);
            }
          } else {
            ptlist[i][0] = axis - (ptlist[i][0] - axis);
          }
        }
      }
      return ptlist;
    };

    var hut = function(xoff, yoff, args) {
      var args = args != undefined ? args : {};
      var hei = args.hei != undefined ? args.hei : 40;
      var wid = args.wid != undefined ? args.wid : 180;
      var tex = args.tex != undefined ? args.tex : 300;

      var reso = [10, 10];
      var ptlist = [];

      for (var i = 0; i < reso[0]; i++) {
        ptlist.push([]);
        var heir = hei + hei * 0.2 * Math.random();
        for (var j = 0; j < reso[1]; j++) {
          var nx =
            wid * (i / (reso[0] - 1) - 0.5) * Math.pow(j / (reso[1] - 1), 0.7);
          var ny = heir * (j / (reso[1] - 1));
          ptlist[ptlist.length - 1].push([nx, ny]);
        }
      }
      var canv = "";
      canv += poly(
        ptlist[0]
          .slice(0, -1)
          .concat(ptlist[ptlist.length - 1].slice(0, -1).reverse()),
        { xof: xoff, yof: yoff, fil: "white", str: "none" },
      );
      canv += poly(ptlist[0], {
        xof: xoff,
        yof: yoff,
        fil: "none",
        str: "rgba(100,100,100,0.3)",
        wid: 2,
      });
      canv += poly(ptlist[ptlist.length - 1], {
        xof: xoff,
        yof: yoff,
        fil: "none",
        str: "rgba(100,100,100,0.3)",
        wid: 2,
      });

      canv += texture(ptlist, {
        xof: xoff,
        yof: yoff,
        tex: tex,
        wid: 1,
        len: 0.25,
        col: function(x) {
          return (
            "rgba(120,120,120," + (0.3 + Math.random() * 0.3).toFixed(3) + ")"
          );
        },
        dis: function() {
          return wtrand(a => a * a);
        },
        noi: function(x) {
          return 5;
        },
      });

      for (var i = 0; i < reso[0]; i++) {
        //canv += poly(ptlist[i],{xof:xoff,yof:yoff,fil:"none",str:"red",wid:2})
      }

      return canv;
    };

    var box = function(xoff, yoff, args) {
      var args = args != undefined ? args : {};
      var hei = args.hei != undefined ? args.hei : 20;
      var wid = args.wid != undefined ? args.wid : 120;
      var rot = args.rot != undefined ? args.rot : 0.7;
      var per = args.per != undefined ? args.per : 4;
      var tra = args.tra != undefined ? args.tra : true;
      var bot = args.bot != undefined ? args.bot : true;
      var wei = args.wei != undefined ? args.wei : 3;
      var dec =
        args.dec != undefined
          ? args.dec
          : function(a) {
              return [];
            };

      var mid = -wid * 0.5 + wid * rot;
      var bmid = -wid * 0.5 + wid * (1 - rot);
      var ptlist = [];
      ptlist.push(div([[-wid * 0.5, -hei], [-wid * 0.5, 0]], 5));
      ptlist.push(div([[wid * 0.5, -hei], [wid * 0.5, 0]], 5));
      if (bot) {
        ptlist.push(div([[-wid * 0.5, 0], [mid, per]], 5));
        ptlist.push(div([[wid * 0.5, 0], [mid, per]], 5));
      }
      ptlist.push(div([[mid, -hei], [mid, per]], 5));
      if (tra) {
        if (bot) {
          ptlist.push(div([[-wid * 0.5, 0], [bmid, -per]], 5));
          ptlist.push(div([[wid * 0.5, 0], [bmid, -per]], 5));
        }
        ptlist.push(div([[bmid, -hei], [bmid, -per]], 5));
      }

      var surf = (rot < 0.5) * 2 - 1;
      ptlist = ptlist.concat(
        dec({
          pul: [surf * wid * 0.5, -hei],
          pur: [mid, -hei + per],
          pdl: [surf * wid * 0.5, 0],
          pdr: [mid, per],
        }),
      );

      var polist = [
        [-wid * 0.5, -hei],
        [wid * 0.5, -hei],
        [wid * 0.5, 0],
        [mid, per],
        [-wid * 0.5, 0],
      ];

      var canv = "";
      if (!tra) {
        canv += poly(polist, {
          xof: xoff,
          yof: yoff,
          str: "none",
          fil: "white",
        });
      }

      for (var i = 0; i < ptlist.length; i++) {
        canv += stroke(
          ptlist[i].map(function(x) {
            return [x[0] + xoff, x[1] + yoff];
          }),
          {
            col: "rgba(100,100,100,0.4)",
            noi: 1,
            wid: wei,
            fun: function(x) {
              return 1;
            },
          },
        );
      }
      return canv;
    };

    var deco = function(style, args) {
      var args = args != undefined ? args : {};
      var pul = args.pul != undefined ? args.pul : [0, 0];
      var pur = args.pur != undefined ? args.pur : [0, 100];
      var pdl = args.pdl != undefined ? args.pdl : [100, 0];
      var pdr = args.pdr != undefined ? args.pdr : [100, 100];
      var hsp = args.hsp != undefined ? args.hsp : [1, 3];
      var vsp = args.vsp != undefined ? args.vsp : [1, 2];

      var plist = [];
      var dl = div([pul, pdl], vsp[1]);
      var dr = div([pur, pdr], vsp[1]);
      var du = div([pul, pur], hsp[1]);
      var dd = div([pdl, pdr], hsp[1]);

      if (style == 1) {
        //-| |-
        var mlu = du[hsp[0]];
        var mru = du[du.length - 1 - hsp[0]];
        var mld = dd[hsp[0]];
        var mrd = dd[du.length - 1 - hsp[0]];

        for (var i = vsp[0]; i < dl.length - vsp[0]; i += vsp[0]) {
          var mml = div([mlu, mld], vsp[1])[i];
          var mmr = div([mru, mrd], vsp[1])[i];
          var ml = dl[i];
          var mr = dr[i];
          plist.push(div([mml, ml], 5));
          plist.push(div([mmr, mr], 5));
        }
        plist.push(div([mlu, mld], 5));
        plist.push(div([mru, mrd], 5));
      } else if (style == 2) {
        //||||

        for (var i = hsp[0]; i < du.length - hsp[0]; i += hsp[0]) {
          var mu = du[i];
          var md = dd[i];
          plist.push(div([mu, md], 5));
        }
      } else if (style == 3) {
        //|##|
        var mlu = du[hsp[0]];
        var mru = du[du.length - 1 - hsp[0]];
        var mld = dd[hsp[0]];
        var mrd = dd[du.length - 1 - hsp[0]];

        for (var i = vsp[0]; i < dl.length - vsp[0]; i += vsp[0]) {
          var mml = div([mlu, mld], vsp[1])[i];
          var mmr = div([mru, mrd], vsp[1])[i];
          var mmu = div([mlu, mru], vsp[1])[i];
          var mmd = div([mld, mrd], vsp[1])[i];

          var ml = dl[i];
          var mr = dr[i];
          plist.push(div([mml, mmr], 5));
          plist.push(div([mmu, mmd], 5));
        }
        plist.push(div([mlu, mld], 5));
        plist.push(div([mru, mrd], 5));
      }
      return plist;
    };

    var rail = function(xoff, yoff, seed, args) {
      var args = args != undefined ? args : {};
      var hei = args.hei != undefined ? args.hei : 20;
      var wid = args.wid != undefined ? args.wid : 180;
      var rot = args.rot != undefined ? args.rot : 0.7;
      var per = args.per != undefined ? args.per : 4;
      var seg = args.seg != undefined ? args.seg : 4;
      var wei = args.wei != undefined ? args.wei : 1;
      var tra = args.tra != undefined ? args.tra : true;
      var fro = args.fro != undefined ? args.fro : true;

      seed = seed != undefined ? seed : 0;

      var mid = -wid * 0.5 + wid * rot;
      var bmid = -wid * 0.5 + wid * (1 - rot);
      var ptlist = [];

      if (fro) {
        ptlist.push(div([[-wid * 0.5, 0], [mid, per]], seg));
        ptlist.push(div([[mid, per], [wid * 0.5, 0]], seg));
      }
      if (tra) {
        ptlist.push(div([[-wid * 0.5, 0], [bmid, -per]], seg));
        ptlist.push(div([[bmid, -per], [wid * 0.5, 0]], seg));
      }
      if (fro) {
        ptlist.push(div([[-wid * 0.5, -hei], [mid, -hei + per]], seg));
        ptlist.push(div([[mid, -hei + per], [wid * 0.5, -hei]], seg));
      }
      if (tra) {
        ptlist.push(div([[-wid * 0.5, -hei], [bmid, -hei - per]], seg));
        ptlist.push(div([[bmid, -hei - per], [wid * 0.5, -hei]], seg));
      }
      if (tra) {
        var open = Math.floor(Math.random() * ptlist.length);
        ptlist[open] = ptlist[open].slice(0, -1);
        ptlist[(open + ptlist.length) % ptlist.length] = ptlist[
          (open + ptlist.length) % ptlist.length
        ].slice(0, -1);
      }
      var canv = "";

      for (var i = 0; i < ptlist.length / 2; i++) {
        for (var j = 0; j < ptlist[i].length; j++) {
          //ptlist.push(div([ptlist[i][j],ptlist[4+i][j]],2))
          ptlist[i][j][1] += (Noise.noise(i, j * 0.5, seed) - 0.5) * hei;
          ptlist[(ptlist.length / 2 + i) % ptlist.length][
            j % ptlist[(ptlist.length / 2 + i) % ptlist.length].length
          ][1] += (Noise.noise(i + 0.5, j * 0.5, seed) - 0.5) * hei;
          var ln = div(
            [
              ptlist[i][j],
              ptlist[(ptlist.length / 2 + i) % ptlist.length][
                j % ptlist[(ptlist.length / 2 + i) % ptlist.length].length
              ],
            ],
            2,
          );
          ln[0][0] += (Math.random() - 0.5) * hei * 0.5;
          canv += poly(ln, {
            xof: xoff,
            yof: yoff,
            fil: "none",
            str: "rgba(100,100,100,0.5)",
            wid: 2,
          });
        }
      }

      for (var i = 0; i < ptlist.length; i++) {
        canv += stroke(
          ptlist[i].map(function(x) {
            return [x[0] + xoff, x[1] + yoff];
          }),
          {
            col: "rgba(100,100,100,0.5)",
            noi: 0.5,
            wid: wei,
            fun: function(x) {
              return 1;
            },
          },
        );
      }
      return canv;
    };

    var roof = function(xoff, yoff, args) {
      var args = args != undefined ? args : {};
      var hei = args.hei != undefined ? args.hei : 20;
      var wid = args.wid != undefined ? args.wid : 120;
      var rot = args.rot != undefined ? args.rot : 0.7;
      var per = args.per != undefined ? args.per : 4;
      var cor = args.cor != undefined ? args.cor : 5;
      var wei = args.wei != undefined ? args.wei : 3;
      var pla = args.pla != undefined ? args.pla : [0, ""];

      var opf = function(ptlist) {
        if (rot < 0.5) {
          return flip(ptlist);
        } else {
          return ptlist;
        }
      };
      var rrot = rot < 0.5 ? 1 - rot : rot;

      var mid = -wid * 0.5 + wid * rrot;
      var bmid = -wid * 0.5 + wid * (1 - rrot);
      var quat = (mid + wid * 0.5) * 0.5 - mid;

      var ptlist = [];
      ptlist.push(
        div(
          opf([
            [-wid * 0.5 + quat, -hei - per / 2],
            [-wid * 0.5 + quat * 0.5, -hei / 2 - per / 4],
            [-wid * 0.5 - cor, 0],
          ]),
          5,
        ),
      );
      ptlist.push(
        div(
          opf([
            [mid + quat, -hei],
            [(mid + quat + wid * 0.5) / 2, -hei / 2],
            [wid * 0.5 + cor, 0],
          ]),
          5,
        ),
      );
      ptlist.push(
        div(
          opf([
            [mid + quat, -hei],
            [mid + quat / 2, -hei / 2 + per / 2],
            [mid + cor, per],
          ]),
          5,
        ),
      );

      ptlist.push(div(opf([[-wid * 0.5 - cor, 0], [mid + cor, per]]), 5));
      ptlist.push(div(opf([[wid * 0.5 + cor, 0], [mid + cor, per]]), 5));

      ptlist.push(
        div(opf([[-wid * 0.5 + quat, -hei - per / 2], [mid + quat, -hei]]), 5),
      );

      var canv = "";

      var polist = opf([
        [-wid * 0.5, 0],
        [-wid * 0.5 + quat, -hei - per / 2],
        [mid + quat, -hei],
        [wid * 0.5, 0],
        [mid, per],
      ]);
      canv += poly(polist, { xof: xoff, yof: yoff, str: "none", fil: "white" });

      for (var i = 0; i < ptlist.length; i++) {
        canv += stroke(
          ptlist[i].map(function(x) {
            return [x[0] + xoff, x[1] + yoff];
          }),
          {
            col: "rgba(100,100,100,0.4)",
            noi: 1,
            wid: wei,
            fun: function(x) {
              return 1;
            },
          },
        );
      }

      if (pla[0] == 1) {
        var pp = opf([
          [mid + quat / 2, -hei / 2 + per / 2],
          [-wid * 0.5 + quat * 0.5, -hei / 2 - per / 4],
        ]);
        if (pp[0][0] > pp[1][0]) {
          pp = [pp[1], pp[0]];
        }
        var mp = PolyTools.midPt(pp);
        var a = Math.atan2(pp[1][1] - pp[0][1], pp[1][0] - pp[0][0]);
        var adeg = (a * 180) / Math.PI;
        canv +=
          "<text font-size='" +
          hei * 0.6 +
          "' font-family='Verdana'" +
          " style='fill:rgba(100,100,100,0.9)'" +
          " text-anchor='middle' transform='translate(" +
          (mp[0] + xoff) +
          "," +
          (mp[1] + yoff) +
          ") rotate(" +
          adeg +
          ")'>" +
          pla[1] +
          "</text>";
      }
      return canv;
    };

    var pagroof = function(xoff, yoff, args) {
      var args = args != undefined ? args : {};
      var hei = args.hei != undefined ? args.hei : 20;
      var wid = args.wid != undefined ? args.wid : 120;
      var rot = args.rot != undefined ? args.rot : 0.7;
      var per = args.per != undefined ? args.per : 4;
      var cor = args.cor != undefined ? args.cor : 10;
      var sid = args.sid != undefined ? args.sid : 4;
      var wei = args.wei != undefined ? args.wei : 3;

      var ptlist = [];
      var polist = [[0, -hei]];
      var canv = "";
      for (var i = 0; i < sid; i++) {
        var fx = wid * ((i * 1.0) / (sid - 1) - 0.5);
        var fy = per * (1 - Math.abs((i * 1.0) / (sid - 1) - 0.5) * 2);
        var fxx = (wid + cor) * ((i * 1.0) / (sid - 1) - 0.5);
        if (i > 0) {
          ptlist.push([ptlist[ptlist.length - 1][2], [fxx, fy]]);
        }
        ptlist.push([[0, -hei], [fx * 0.5, (-hei + fy) * 0.5], [fxx, fy]]);
        polist.push([fxx, fy]);
      }

      canv += poly(polist, { xof: xoff, yof: yoff, str: "none", fil: "white" });
      for (var i = 0; i < ptlist.length; i++) {
        canv += stroke(
          div(ptlist[i], 5).map(function(x) {
            return [x[0] + xoff, x[1] + yoff];
          }),
          {
            col: "rgba(100,100,100,0.4)",
            noi: 1,
            wid: wei,
            fun: function(x) {
              return 1;
            },
          },
        );
      }

      return canv;
    };

    this.arch01 = function(xoff, yoff, seed, args) {
      var args = args != undefined ? args : {};
      var hei = args.hei != undefined ? args.hei : 70;
      var wid = args.wid != undefined ? args.wid : 180;
      var rot = args.rot != undefined ? args.rot : 0.7;
      var per = args.per != undefined ? args.per : 5;

      seed = seed != undefined ? seed : 0;

      var p = 0.4 + Math.random() * 0.2;
      var h0 = hei * p;
      var h1 = hei * (1 - p);

      var canv = "";
      canv += hut(xoff, yoff - hei, { hei: h0, wid: wid });
      canv += box(xoff, yoff, {
        hei: h1,
        wid: (wid * 2) / 3,
        per: per,
        bot: false,
      });

      canv += rail(xoff, yoff, seed, {
        tra: true,
        fro: false,
        hei: 10,
        wid: wid,
        per: per * 2,
        seg: (3 + Math.random() * 3) | 0,
      });

      var mcnt = randChoice([0, 1, 1, 2]);
      if (mcnt == 1) {
        canv += Man.man(xoff + normRand(-wid / 3, wid / 3), yoff, {
          fli: randChoice([true, false]),
          sca: 0.42,
        });
      } else if (mcnt == 2) {
        canv += Man.man(xoff + normRand(-wid / 4, -wid / 5), yoff, {
          fli: false,
          sca: 0.42,
        });
        canv += Man.man(xoff + normRand(wid / 5, wid / 4), yoff, {
          fli: true,
          sca: 0.42,
        });
      }
      canv += rail(xoff, yoff, seed, {
        tra: false,
        fro: true,
        hei: 10,
        wid: wid,
        per: per * 2,
        seg: (3 + Math.random() * 3) | 0,
      });

      return canv;
    };

    this.arch02 = function(xoff, yoff, seed, args) {
      var args = args != undefined ? args : {};
      var hei = args.hei != undefined ? args.hei : 10;
      var wid = args.wid != undefined ? args.wid : 50;
      var rot = args.rot != undefined ? args.rot : 0.3;
      var per = args.per != undefined ? args.per : 5;
      var sto = args.sto != undefined ? args.sto : 3;
      var sty = args.sty != undefined ? args.sty : 1;
      var rai = args.rai != undefined ? args.rai : false;

      seed = seed != undefined ? seed : 0;
      var canv = "";

      var hoff = 0;
      for (var i = 0; i < sto; i++) {
        canv += box(xoff, yoff - hoff, {
          tra: false,
          hei: hei,
          wid: wid * Math.pow(0.85, i),
          rot: rot,
          wei: 1.5,
          per: per,
          dec: function(a) {
            return deco(
              sty,
              Object.assign({}, a, {
                hsp: [[], [1, 5], [1, 5], [1, 4]][sty],
                vsp: [[], [1, 2], [1, 2], [1, 3]][sty],
              }),
            );
          },
        });
        canv += rai
          ? rail(xoff, yoff - hoff, i * 0.2, {
              wid: wid * Math.pow(0.85, i) * 1.1,
              hei: hei / 2,
              per: per,
              rot: rot,
              wei: 0.5,
              tra: false,
            })
          : [];
        var pla = undefined;
        if (sto == 1 && Math.random() < 1 / 3) {
          pla = [1, "Pizza Hut"];
        }
        canv += roof(xoff, yoff - hoff - hei, {
          hei: hei,
          wid: wid * Math.pow(0.9, i),
          rot: rot,
          wei: 1.5,
          per: per,
          pla: pla,
        });

        hoff += hei * 1.5;
      }
      return canv;
    };
    this.arch03 = function(xoff, yoff, seed, args) {
      var args = args != undefined ? args : {};
      var hei = args.hei != undefined ? args.hei : 10;
      var wid = args.wid != undefined ? args.wid : 50;
      var rot = args.rot != undefined ? args.rot : 0.7;
      var per = args.per != undefined ? args.per : 5;
      var sto = args.sto != undefined ? args.sto : 7;

      seed = seed != undefined ? seed : 0;
      var canv = "";

      var hoff = 0;
      for (var i = 0; i < sto; i++) {
        canv += box(xoff, yoff - hoff, {
          tra: false,
          hei: hei,
          wid: wid * Math.pow(0.85, i),
          rot: rot,
          wei: 1.5,
          per: per / 2,
          dec: function(a) {
            return deco(1, Object.assign({}, a, { hsp: [1, 4], vsp: [1, 2] }));
          },
        });
        canv += rail(xoff, yoff - hoff, i * 0.2, {
          seg: 5,
          wid: wid * Math.pow(0.85, i) * 1.1,
          hei: hei / 2,
          per: per / 2,
          rot: rot,
          wei: 0.5,
          tra: false,
        });
        canv += pagroof(xoff, yoff - hoff - hei, {
          hei: hei * 1.5,
          wid: wid * Math.pow(0.9, i),
          rot: rot,
          wei: 1.5,
          per: per,
        });
        hoff += hei * 1.5;
      }
      return canv;
    };
    this.arch04 = function(xoff, yoff, seed, args) {
      var args = args != undefined ? args : {};
      var hei = args.hei != undefined ? args.hei : 15;
      var wid = args.wid != undefined ? args.wid : 30;
      var rot = args.rot != undefined ? args.rot : 0.7;
      var per = args.per != undefined ? args.per : 5;
      var sto = args.sto != undefined ? args.sto : 2;

      seed = seed != undefined ? seed : 0;
      var canv = "";

      var hoff = 0;
      for (var i = 0; i < sto; i++) {
        canv += box(xoff, yoff - hoff, {
          tra: true,
          hei: hei,
          wid: wid * Math.pow(0.85, i),
          rot: rot,
          wei: 1.5,
          per: per / 2,
          dec: function(a) {
            return [];
          },
        });
        canv += rail(xoff, yoff - hoff, i * 0.2, {
          seg: 3,
          wid: wid * Math.pow(0.85, i) * 1.2,
          hei: hei / 3,
          per: per / 2,
          rot: rot,
          wei: 0.5,
          tra: true,
        });
        canv += pagroof(xoff, yoff - hoff - hei, {
          hei: hei * 1,
          wid: wid * Math.pow(0.9, i),
          rot: rot,
          wei: 1.5,
          per: per,
        });
        hoff += hei * 1.2;
      }
      return canv;
    };

    this.boat01 = function(xoff, yoff, seed, args) {
      var args = args != undefined ? args : {};
      var len = args.len != undefined ? args.len : 120;
      var sca = args.sca != undefined ? args.sca : 1;
      var fli = args.fli != undefined ? args.fli : false;
      var canv = "";

      var dir = fli ? -1 : 1;
      canv += Man.man(xoff + 20 * sca * dir, yoff, {
        ite: Man.stick01,
        hat: Man.hat02,
        sca: 0.5 * sca,
        fli: !fli,
        len: [0, 30, 20, 30, 10, 30, 30, 30, 30],
      });

      var plist1 = [];
      var plist2 = [];
      var fun1 = function(x) {
        return Math.pow(Math.sin(x * Math.PI), 0.5) * 7 * sca;
      };
      var fun2 = function(x) {
        return Math.pow(Math.sin(x * Math.PI), 0.5) * 10 * sca;
      };
      for (var i = 0; i < len * sca; i += 5 * sca) {
        plist1.push([i * dir, fun1(i / len)]);
        plist2.push([i * dir, fun2(i / len)]);
      }
      var plist = plist1.concat(plist2.reverse());
      canv += poly(plist, { xof: xoff, yof: yoff, fil: "white" });
      canv += stroke(plist.map(v => [xoff + v[0], yoff + v[1]]), {
        wid: 1,
        fun: function(x) {
          return Math.sin(x * Math.PI * 2);
        },
        col: "rgba(100,100,100,0.4)",
      });

      return canv;
    };

    this.transmissionTower01 = function(xoff, yoff, seed, args) {
      var args = args != undefined ? args : {};
      var hei = args.hei != undefined ? args.hei : 100;
      var wid = args.wid != undefined ? args.wid : 20;

      var canv = "";
      var toGlobal = function(v) {
        return [v[0] + xoff, v[1] + yoff];
      };

      var quickstroke = function(pl) {
        return stroke(div(pl, 5).map(toGlobal), {
          wid: 1,
          fun: x => 0.5,
          col: "rgba(100,100,100,0.4)",
        });
      };

      var p00 = [-wid * 0.05, -hei];
      var p01 = [wid * 0.05, -hei];

      var p10 = [-wid * 0.1, -hei * 0.9];
      var p11 = [wid * 0.1, -hei * 0.9];

      var p20 = [-wid * 0.2, -hei * 0.5];
      var p21 = [wid * 0.2, -hei * 0.5];

      var p30 = [-wid * 0.5, 0];
      var p31 = [wid * 0.5, 0];

      var bch = [[0.7, -0.85], [1, -0.675], [0.7, -0.5]];

      for (var i = 0; i < bch.length; i++) {
        canv += quickstroke([
          [-bch[i][0] * wid, bch[i][1] * hei],
          [bch[i][0] * wid, bch[i][1] * hei],
        ]);
        canv += quickstroke([
          [-bch[i][0] * wid, bch[i][1] * hei],
          [0, (bch[i][1] - 0.05) * hei],
        ]);
        canv += quickstroke([
          [bch[i][0] * wid, bch[i][1] * hei],
          [0, (bch[i][1] - 0.05) * hei],
        ]);

        canv += quickstroke([
          [-bch[i][0] * wid, bch[i][1] * hei],
          [-bch[i][0] * wid, (bch[i][1] + 0.1) * hei],
        ]);
        canv += quickstroke([
          [bch[i][0] * wid, bch[i][1] * hei],
          [bch[i][0] * wid, (bch[i][1] + 0.1) * hei],
        ]);
      }

      var l10 = div([p00, p10, p20, p30], 5);
      var l11 = div([p01, p11, p21, p31], 5);

      for (var i = 0; i < l10.length - 1; i++) {
        canv += quickstroke([l10[i], l11[i + 1]]);
        canv += quickstroke([l11[i], l10[i + 1]]);
      }

      canv += quickstroke([p00, p01]);
      canv += quickstroke([p10, p11]);
      canv += quickstroke([p20, p21]);
      canv += quickstroke([p00, p10, p20, p30]);
      canv += quickstroke([p01, p11, p21, p31]);

      return canv;
    };
  }();

  var Man = new function() {
    var expand = function(ptlist, wfun) {
      vtxlist0 = [];
      vtxlist1 = [];
      vtxlist = [];
      var n0 = Math.random() * 10;
      for (var i = 1; i < ptlist.length - 1; i++) {
        var w = wfun(i / ptlist.length);
        var a1 = Math.atan2(
          ptlist[i][1] - ptlist[i - 1][1],
          ptlist[i][0] - ptlist[i - 1][0],
        );
        var a2 = Math.atan2(
          ptlist[i][1] - ptlist[i + 1][1],
          ptlist[i][0] - ptlist[i + 1][0],
        );
        var a = (a1 + a2) / 2;
        if (a < a2) {
          a += Math.PI;
        }
        vtxlist0.push([
          ptlist[i][0] + w * Math.cos(a),
          ptlist[i][1] + w * Math.sin(a),
        ]);
        vtxlist1.push([
          ptlist[i][0] - w * Math.cos(a),
          ptlist[i][1] - w * Math.sin(a),
        ]);
      }
      var l = ptlist.length - 1;
      var a0 =
        Math.atan2(ptlist[1][1] - ptlist[0][1], ptlist[1][0] - ptlist[0][0]) -
        Math.PI / 2;
      var a1 =
        Math.atan2(
          ptlist[l][1] - ptlist[l - 1][1],
          ptlist[l][0] - ptlist[l - 1][0],
        ) -
        Math.PI / 2;
      var w0 = wfun(0);
      var w1 = wfun(1);
      vtxlist0.unshift([
        ptlist[0][0] + w0 * Math.cos(a0),
        ptlist[0][1] + w0 * Math.sin(a0),
      ]);
      vtxlist1.unshift([
        ptlist[0][0] - w0 * Math.cos(a0),
        ptlist[0][1] - w0 * Math.sin(a0),
      ]);
      vtxlist0.push([
        ptlist[l][0] + w1 * Math.cos(a1),
        ptlist[l][1] + w1 * Math.sin(a1),
      ]);
      vtxlist1.push([
        ptlist[l][0] - w1 * Math.cos(a1),
        ptlist[l][1] - w1 * Math.sin(a1),
      ]);
      return [vtxlist0, vtxlist1];
    };

    var tranpoly = function(p0, p1, ptlist) {
      var plist = ptlist.map(function(v) {
        return [-v[0], v[1]];
      });
      var ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) - Math.PI / 2;
      var scl = distance(p0, p1);
      var qlist = plist.map(function(v) {
        var d = distance(v, [0, 0]);
        var a = Math.atan2(v[1], v[0]);
        return [
          p0[0] + d * scl * Math.cos(ang + a),
          p0[1] + d * scl * Math.sin(ang + a),
        ];
      });
      return qlist;
    };
    var flipper = function(plist) {
      return plist.map(function(v) {
        return [-v[0], v[1]];
      });
    };

    this.hat01 = function(p0, p1, args) {
      var args = args != undefined ? args : {};
      var fli = args.fli != undefined ? args.fli : false;

      var canv = "";
      var seed = Math.random();
      var f = fli
        ? flipper
        : function(x) {
            return x;
          };
      //var plist = [[-0.5,0.5],[0.5,0.5],[0.5,1],[-0.5,2]]
      canv += poly(
        tranpoly(
          p0,
          p1,
          f([
            [-0.3, 0.5],
            [0.3, 0.8],
            [0.2, 1],
            [0, 1.1],
            [-0.3, 1.15],
            [-0.55, 1],
            [-0.65, 0.5],
          ]),
        ),
        { fil: "rgba(100,100,100,0.8)" },
      );

      var qlist1 = [];
      for (var i = 0; i < 10; i++) {
        qlist1.push([
          -0.3 - Noise.noise(i * 0.2, seed) * i * 0.1,
          0.5 - i * 0.3,
        ]);
      }
      canv += poly(tranpoly(p0, p1, f(qlist1)), {
        str: "rgba(100,100,100,0.8)",
        wid: 1,
      });

      return canv;
    };

    this.hat02 = function(p0, p1, args) {
      var args = args != undefined ? args : {};
      var fli = args.fli != undefined ? args.fli : false;

      var canv = "";
      var seed = Math.random();

      var f = fli
        ? flipper
        : function(x) {
            return x;
          };
      // canv += poly(tranpoly(p0,p1,[
      //   [-0.3,0.6],[-0.15,1.0],[0,1.1],[0.15,1.0],[0.3,0.6]
      //   ]),{fil:"white",str:"rgba(130,130,130,0.8)",wid:1})
      canv += poly(
        tranpoly(
          p0,
          p1,
          f([
            [-0.3, 0.5],
            [-1.1, 0.5],
            [-1.2, 0.6],
            [-1.1, 0.7],
            [-0.3, 0.8],
            [0.3, 0.8],
            [1.0, 0.7],
            [1.3, 0.6],
            [1.2, 0.5],
            [0.3, 0.5],
          ]),
        ),
        { fil: "rgba(100,100,100,0.8)" },
      );
      return canv;
    };

    this.stick01 = function(p0, p1, args) {
      var args = args != undefined ? args : {};
      var fli = args.fli != undefined ? args.fli : false;

      var canv = "";
      var seed = Math.random();
      var f = fli
        ? flipper
        : function(x) {
            return x;
          };

      var qlist1 = [];
      var l = 12;
      for (var i = 0; i < l; i++) {
        qlist1.push([
          -Noise.noise(i * 0.1, seed) * 0.1 * Math.sin((i / l) * Math.PI) * 5,
          0 + i * 0.3,
        ]);
      }
      canv += poly(tranpoly(p0, p1, f(qlist1)), {
        str: "rgba(100,100,100,0.5)",
        wid: 1,
      });

      return canv;
    };

    //      2
    //    1/
    // 7/  | \_ 6
    // 8| 0 \ 5
    //      /3
    //     4

    this.man = function(xoff, yoff, args) {
      var args = args != undefined ? args : {};
      var sca = args.sca != undefined ? args.sca : 0.5;
      var hat = args.hat != undefined ? args.hat : Man.hat01;
      var ite =
        args.ite != undefined
          ? args.ite
          : function() {
              return "";
            };
      var fli = args.fli != undefined ? args.fli : true;
      var ang =
        args.ang != undefined
          ? args.ang
          : [
              0,
              -Math.PI / 2,
              normRand(0, 0),
              (Math.PI / 4) * Math.random(),
              ((Math.PI * 3) / 4) * Math.random(),
              (Math.PI * 3) / 4,
              -Math.PI / 4,
              (-Math.PI * 3) / 4 - (Math.PI / 4) * Math.random(),
              -Math.PI / 4,
            ];
      var len =
        args.len != undefined ? args.len : [0, 30, 20, 30, 30, 30, 30, 30, 30];

      len = len.map(function(v) {
        return v * sca;
      });
      var canv = "";
      var sct = {
        0: { 1: { 2: {}, 5: { 6: {} }, 7: { 8: {} } }, 3: { 4: {} } },
      };
      var toGlobal = function(v) {
        return [(fli ? -1 : 1) * v[0] + xoff, v[1] + yoff];
      };

      function gpar(sct, ind) {
        var keys = Object.keys(sct);
        for (var i = 0; i < keys.length; i++) {
          if (keys[i] == ind) {
            return [ind];
          } else {
            var r = gpar(sct[keys[i]], ind);
            if (r != false) {
              return [parseFloat(keys[i])].concat(r);
            }
          }
        }
        return false;
      }
      function grot(sct, ind) {
        var par = gpar(sct, ind);
        var rot = 0;
        for (var i = 0; i < par.length; i++) {
          rot += ang[par[i]];
        }
        return rot;
      }
      function gpos(sct, ind) {
        var par = gpar(sct, ind);
        var pos = [0, 0];
        for (var i = 0; i < par.length; i++) {
          var a = grot(sct, par[i]);
          pos[0] += len[par[i]] * Math.cos(a);
          pos[1] += len[par[i]] * Math.sin(a);
        }
        return pos;
      }

      var pts = [];
      for (var i = 0; i < ang.length; i++) {
        pts.push(gpos(sct, i));
      }
      yoff -= pts[4][1];

      for (var i = 1; i < pts.length; i++) {
        var par = gpar(sct, i);
        var p0 = gpos(sct, par[par.length - 2]);
        var s = div([p0, pts[i]], 10);
        //canv += stroke(s.map(toGlobal))
      }

      var cloth = function(plist, fun) {
        var canv = "";
        var tlist = bezmh(plist, 2);
        var [tlist1, tlist2] = expand(tlist, fun);
        canv += poly(tlist1.concat(tlist2.reverse()).map(toGlobal), {
          fil: "white",
        });
        canv += stroke(tlist1.map(toGlobal), {
          wid: 1,
          col: "rgba(100,100,100,0.5)",
        });
        canv += stroke(tlist2.map(toGlobal), {
          wid: 1,
          col: "rgba(100,100,100,0.6)",
        });

        return canv;
      };

      var fsleeve = function(x) {
        return (
          sca *
          8 *
          (Math.sin(0.5 * x * Math.PI) * Math.pow(Math.sin(x * Math.PI), 0.1) +
            (1 - x) * 0.4)
        );
      };
      var fbody = function(x) {
        return (
          sca *
          11 *
          (Math.sin(0.5 * x * Math.PI) * Math.pow(Math.sin(x * Math.PI), 0.1) +
            (1 - x) * 0.5)
        );
      };
      var fhead = function(x) {
        return sca * 7 * Math.pow(0.25 - Math.pow(x - 0.5, 2), 0.3);
      };

      canv += ite(toGlobal(pts[8]), toGlobal(pts[6]), { fli: fli });

      canv += cloth([pts[1], pts[7], pts[8]], fsleeve);
      canv += cloth([pts[1], pts[0], pts[3], pts[4]], fbody);
      canv += cloth([pts[1], pts[5], pts[6]], fsleeve);
      canv += cloth([pts[1], pts[2]], fhead);

      var hlist = bezmh([pts[1], pts[2]], 2);
      var [hlist1, hlist2] = expand(hlist, fhead);
      hlist1.splice(0, Math.floor(hlist1.length * 0.1));
      hlist2.splice(0, Math.floor(hlist2.length * 0.95));
      canv += poly(hlist1.concat(hlist2.reverse()).map(toGlobal), {
        fil: "rgba(100,100,100,0.6)",
      });

      canv += hat(toGlobal(pts[1]), toGlobal(pts[2]), { fli: fli });

      return canv;
    };
  }();

  function water(xoff, yoff, seed, args) {
    var args = args != undefined ? args : {};
    var hei = args.hei != undefined ? args.hei : 2;
    var len = args.len != undefined ? args.len : 800;
    var clu = args.clu != undefined ? args.clu : 10;
    var canv = "";

    var ptlist = [];
    var yk = 0;
    for (var i = 0; i < clu; i++) {
      ptlist.push([]);
      var xk = (Math.random() - 0.5) * (len / 8);
      yk += Math.random() * 5;
      var lk = len / 4 + Math.random() * (len / 4);
      var reso = 5;
      for (var j = -lk; j < lk; j += reso) {
        ptlist[ptlist.length - 1].push([
          j + xk,
          Math.sin(j * 0.2) * hei * Noise.noise(j * 0.1) - 20 + yk,
        ]);
      }
    }

    for (var j = 1; j < ptlist.length; j += 1) {
      canv += stroke(
        ptlist[j].map(function(x) {
          return [x[0] + xoff, x[1] + yoff];
        }),
        {
          col:
            "rgba(100,100,100," + (0.3 + Math.random() * 0.3).toFixed(3) + ")",
          wid: 1,
        },
      );
    }

    return canv;
  }

  function mountplanner(xmin, xmax) {
    function locmax(x, y, f, r) {
      var z0 = f(x, y);
      if (z0 <= 0.3) {
        return false;
      }
      for (var i = x - r; i < x + r; i++) {
        for (var j = y - r; j < y + r; j++) {
          if (f(i, j) > z0) {
            return false;
          }
        }
      }
      return true;
    }

    function chadd(r, mind) {
      mind = mind == undefined ? 10 : mind;
      for (var k = 0; k < reg.length; k++) {
        if (Math.abs(reg[k].x - r.x) < mind) {
          return false;
        }
      }
      console.log("+");
      reg.push(r);
      return true;
    }

    var reg = [];
    var samp = 0.03;
    var ns = function(x, y) {
      return Math.max(Noise.noise(x * samp) - 0.55, 0) * 2;
    };
    var nns = function(x) {
      return 1 - Noise.noise(x * samp);
    };
    var nnns = function(x, y) {
      return Math.max(Noise.noise(x * samp * 2, 2) - 0.55, 0) * 2;
    };
    var yr = function(x) {
      return Noise.noise(x * 0.01, Math.PI);
    };

    var xstep = 5;
    var mwid = 200;
    for (var i = xmin; i < xmax; i += xstep) {
      var i1 = Math.floor(i / xstep);
      MEM.planmtx[i1] = MEM.planmtx[i1] || 0;
    }

    for (var i = xmin; i < xmax; i += xstep) {
      for (var j = 0; j < yr(i) * 480; j += 30) {
        if (locmax(i, j, ns, 2)) {
          var xof = i + 2 * (Math.random() - 0.5) * 500;
          var yof = j + 300;
          var r = { tag: "mount", x: xof, y: yof, h: ns(i, j) };
          var res = chadd(r);
          if (res) {
            for (
              var k = Math.floor((xof - mwid) / xstep);
              k < (xof + mwid) / xstep;
              k++
            ) {
              MEM.planmtx[k] += 1;
            }
          }
        }
      }
      if (Math.abs(i) % 1000 < Math.max(1, xstep - 1)) {
        var r = {
          tag: "distmount",
          x: i,
          y: 280 - Math.random() * 50,
          h: ns(i, j),
        };
        chadd(r);
      }
    }
    console.log([xmin, xmax]);
    for (var i = xmin; i < xmax; i += xstep) {
      if (MEM.planmtx[Math.floor(i / xstep)] == 0) {
        //var r = {tag:"redcirc",x:i,y:700}
        //console.log(i)
        if (Math.random() < 0.01) {
          for (var j = 0; j < 4 * Math.random(); j++) {
            var r = {
              tag: "flatmount",
              x: i + 2 * (Math.random() - 0.5) * 700,
              y: 700 - j * 50,
              h: ns(i, j),
            };
            chadd(r);
          }
        }
      } else {
        // var r = {tag:"greencirc",x:i,y:700}
        // chadd(r)
      }
    }

    for (var i = xmin; i < xmax; i += xstep) {
      if (Math.random() < 0.2) {
        var r = { tag: "boat", x: i, y: 300 + Math.random() * 390 };
        chadd(r, 400);
      }
    }

    return reg;
  }

  MEM = {
    canv: "",
    chunks: [],
    xmin: 0,
    xmax: 0,
    cwid: 512,
    cursx: 0,
    lasttick: 0,
    windx: 3000,
    windy: 800,
    planmtx: [],
  };

  function dummyloader(xmin, xmax) {
    for (var i = xmin; i < xmax; i += 200) {
      //MEM.chunks.push({tag:"?",x:i,y:100,canv:Tree.tree08(i,500,i)})
      //MEM.chunks.push({tag:"?",x:i,y:100,canv:Man.man(i,500)})
      //MEM.chunks.push({tag:"?",x:i,y:100,canv:Arch.arch01(i,500)})
      //MEM.chunks.push({tag:"?",x:i,y:100,canv:Arch.boat01(i,500)})
      //MEM.chunks.push({tag:"?",x:i,y:100,canv:Arch.transmissionTower01(i,500)})
      MEM.chunks.push({
        tag: "?",
        x: i,
        y: 100,
        canv: Arch.arch02(i, 500, 0, { sto: 1, rot: Math.random() }),
      });
    }
  }

  function chunkloader(xmin, xmax) {
    var add = function(nch) {
      if (nch.canv.includes("NaN")) {
        console.log("gotcha:");
        console.log(nch.tag);
        nch.canv = nch.canv.replace(/NaN/g, -1000);
      }
      if (MEM.chunks.length == 0) {
        MEM.chunks.push(nch);
        return;
      } else {
        if (nch.y <= MEM.chunks[0].y) {
          MEM.chunks.unshift(nch);
          return;
        } else if (nch.y >= MEM.chunks[MEM.chunks.length - 1].y) {
          MEM.chunks.push(nch);
          return;
        } else {
          for (var j = 0; j < MEM.chunks.length - 1; j++) {
            if (MEM.chunks[j].y <= nch.y && nch.y <= MEM.chunks[j + 1].y) {
              MEM.chunks.splice(j + 1, 0, nch);
              return;
            }
          }
        }
      }
      console.log("EH?WTF!");
      console.log(MEM.chunks);
      console.log(nch);
    };

    while (xmax > MEM.xmax - MEM.cwid || xmin < MEM.xmin + MEM.cwid) {
      console.log("generating new chunk...");

      var plan;
      if (xmax > MEM.xmax - MEM.cwid) {
        plan = mountplanner(MEM.xmax, MEM.xmax + MEM.cwid);
        MEM.xmax = MEM.xmax + MEM.cwid;
      } else {
        plan = mountplanner(MEM.xmin - MEM.cwid, MEM.xmin);
        MEM.xmin = MEM.xmin - MEM.cwid;
      }

      for (var i = 0; i < plan.length; i++) {
        if (plan[i].tag == "mount") {
          add({
            tag: plan[i].tag,
            x: plan[i].x,
            y: plan[i].y,
            canv: Mount.mountain(plan[i].x, plan[i].y, i * 2 * Math.random()),
            //{col:function(x){return "rgba(100,100,100,"+(0.5*Math.random()*plan[i].y/MEM.windy)+")"}}),
          });
          add({
            tag: plan[i].tag,
            x: plan[i].x,
            y: plan[i].y - 10000,
            canv: water(plan[i].x, plan[i].y, i * 2),
          });
        } else if (plan[i].tag == "flatmount") {
          add({
            tag: plan[i].tag,
            x: plan[i].x,
            y: plan[i].y,
            canv: Mount.flatMount(
              plan[i].x,
              plan[i].y,
              2 * Math.random() * Math.PI,
              {
                wid: 600 + Math.random() * 400,
                hei: 100,
                cho: 0.5 + Math.random() * 0.2,
              },
            ),
          });
        } else if (plan[i].tag == "distmount") {
          add({
            tag: plan[i].tag,
            x: plan[i].x,
            y: plan[i].y,
            canv: Mount.distMount(plan[i].x, plan[i].y, Math.random() * 100, {
              hei: 150,
              len: randChoice([500, 1000, 1500]),
            }),
          });
        } else if (plan[i].tag == "boat") {
          add({
            tag: plan[i].tag,
            x: plan[i].x,
            y: plan[i].y,
            canv: Arch.boat01(plan[i].x, plan[i].y, Math.random(), {
              sca: plan[i].y / 800,
              fli: randChoice([true, false]),
            }),
          });
        } else if (plan[i].tag == "redcirc") {
          add({
            tag: plan[i].tag,
            x: plan[i].x,
            y: plan[i].y,
            canv:
              "<circle cx='" +
              plan[i].x +
              "' cy='" +
              plan[i].y +
              "' r='20' stroke='black' fill='red' />",
          });
        } else if (plan[i].tag == "greencirc") {
          add({
            tag: plan[i].tag,
            x: plan[i].x,
            y: plan[i].y,
            canv:
              "<circle cx='" +
              plan[i].x +
              "' cy='" +
              plan[i].y +
              "' r='20' stroke='black' fill='green' />",
          });
        }
        // add ({
        //   x: plan[i].x,
        //   y: plan[i].y,
        //   canv:"<circle cx='"+plan[i].x+"' cy='"+plan[i].y+"' r='20' stroke='black' fill='red' />"
        // })
      }
    }
  }

  function chunkrender(xmin, xmax) {
    MEM.canv = "";

    for (var i = 0; i < MEM.chunks.length; i++) {
      if (
        xmin - MEM.cwid < MEM.chunks[i].x &&
        MEM.chunks[i].x < xmax + MEM.cwid
      ) {
        MEM.canv += MEM.chunks[i].canv;
      }
    }
  }



// MIT, Copyright (c) 2018 Lingdong Huang; see village-LICENSE.txt.
// Generation lives in a worker so its PRNG and drawing work never touch the app.
MEM.planmtx={};
var villageInitialized=false;
self.onmessage=function(event){
 var x=event.data.x, width=event.data.width;
 if(!villageInitialized){
  Math.seed(event.data.seed);
  MEM.xmin=x-1024;MEM.xmax=x-1024;
  villageInitialized=true;
 }
 chunkloader(x,x+width);
 chunkrender(x,x+width);
 self.postMessage({svg:"<svg xmlns='http://www.w3.org/2000/svg' width='"+width+"' height='800' viewBox='"+x+" 0 "+width+" 800'><rect x='"+x+"' width='"+width+"' height='800' fill='white'/><g>"+MEM.canv+"</g></svg>"});
 MEM.chunks=MEM.chunks.filter(function(c){return c.x>x-1024});
 Object.keys(MEM.planmtx).forEach(function(k){if(Number(k)*5<x-1024)delete MEM.planmtx[k]});
 MEM.canv='';
};

}
if(typeof document!=='undefined'){window.conceptVillageWorkerSource='('+conceptVillageGenerator.toString()+')()'}else{conceptVillageGenerator()}

if(typeof document!=='undefined')window.conceptVillagePaperData='data:image/webp;base64,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';
