var taglist = ['.collapsible',
                 '#coordinates',
                 '.NavHead',
                 '.vcard',
                 '.infobox_v2',
                 '.geography',
                 '.collapsed',
                 '.vertical-navbox',
                 '.ambox',
                 '.thumb',
                 '.metadata',
                 '.biota',
                 '.infobox',
                 '.dablink',
                 '.toc',
                 '.NavContent',
                 '.nowraplinks',
                 '.toccolours',
                 '.navbox-inner',
                 '.right',
                 '.seealso', // "See also" italicized phrases
                 '.further', // "Further information" italicized phrases
                 '.mainarticle',
                 '.mw-editsection',
                 '.mw-stack',
                 '.noprint']

var taglist2 = ['strong',
                'img',
                'sup',
                '.nowrap',
                'i',
                'small',
                '.external',
                '.IPA',
                '.unicode',
                '.extiw',
                '.new']

function WikipediaTracer() {
    this.cur = ""
    this.chain = []
}

WikipediaTracer.prototype.seedFromName = function (name) {
    this.cur = name
    this.chain = []
    this.chain.push({
        name: name,
        link: this.linkFromName(name)
    })

    if (this.updateCallback) {
        this.updateCallback.call(null)
    }
}

WikipediaTracer.prototype.getRandomPageName = function () {
    $.ajax({
        url: 'http://en.wikipedia.org/w/api.php?action=query&list=random&format=json&rnnamespace=0&rnlimit=1&indexpageids=',
        dataType: 'jsonp',
        success: function (_this) { //closure
            return function (data) {
                if (_this.gotRandomCallback) {
                    _this.gotRandomCallback.call(null, data.query.random[0].title)
                }
            }
        }(this)
    })
}

WikipediaTracer.prototype.linkFromName = function (name) {
    return "http://en.wikipedia.org/wiki/" + name.split(" ").join("_")
}

WikipediaTracer.prototype.cleanPageName = function (name) {
    return name.split('_').join(' ')
}

WikipediaTracer.prototype.doTrace = function () {
    var turl = 'http://en.wikipedia.org/w/api.php?action=query&format=json&redirects=&prop=revisions&rvlimit=1&rvprop=content&rvsection='
    if (this._tryRvSection) {
        turl += this._tryRvSection
    } else {
        turl += "0"
    }
    turl += "&rvparse=&titles="
    turl += this.cur

    $.ajax({
        url: turl,
        dataType: 'jsonp',
        success: function (_this) { //closure
            return function (data) {
                if (data.error) {
                    if (_this.errorCallback) {
                        // We've run out of sections of the article without finding a link...
                        _this._tryRvSection = null
                        _this.errorCallback.call(null, "Parsing error")
                    }
                    return
                }
                var pages = data.query.pages
                var keys = Object.keys(pages)
                if (keys[0] == "-1") {
                    if (_this.errorCallback) {
                        _this.errorCallback.call(null, "Couldn't find an article with that name")
                    }
                    return
                }
                _this._text = pages[keys[0]].revisions[0]["*"]
                _this.analyzeContent()
            }
        }(this)
    })

}

WikipediaTracer.prototype.searchElement = function (elm) {
    
    // Search a single element for a link

    for (j = 0; j < taglist2.length; j ++) {
        $(elm).find(taglist2[j]).remove()
    }

    var links = []

    var li = 0

    // On each link, piggy back an attribute that tells us its actual unedited index in the content
    $(elm).find('a').each(function (ind) {
        links.push($(this).attr('href'))
        $(this).attr('absolute-link-index', li)
        li += 1
    })

    // Now remove parenthetical expressions and other unallowed exceptions by grabbing the html and doing raw string manipulation on it
    var inner = $(elm).html()
    while (inner.match(/\(.*?\)/g)) {
        inner = inner.replace(/\(.[^\(]*?\)/g, "")
        inner = inner.replace(/\(\)/g, "")
    }

    // Rebuild an element out of the edited text
    elm = $("<p>").append(inner)

    // Find the *new* first link, and find the actual link that it corresponds to by getting its absolute-link-index and fetching
    // the actual link from our links array

    var firstLinkIndex = $(elm).find('a').first().attr('absolute-link-index')
    if (firstLinkIndex != null) {
        
        // SUCCESS!

        // Now start building a chain Link and return it to the caller

        var actualLink = links[firstLinkIndex]
        var nextSeed = actualLink.substr(6)

        var cont = true

        var chainAppend = {
            seed: nextSeed,
            name: this.cleanPageName(nextSeed),
            link: this.linkFromName(nextSeed)
        }

        return chainAppend

    } else {

        return null
    }

    return null
}

WikipediaTracer.prototype.compareAndContinue = function (chainLink) {
    
    this._tryRvSection = null

    cont = true

    // Detect if we have looped

    i = 0
    for (i = 0; i < this.chain.length; i ++) {
        if (this.chain[i].link == chainLink.link) {
            cont = false
            this.loopBackIndex = i
        }
    }

    // Call the appropriate callback

    if (cont) {
        this.chain.push(chainLink)
        if (this.updateCallback != null) {
            this.updateCallback.call(null)
        }
    } else {
        if (this.doneCallback != null) {
            this.doneCallback.call(null)
        }
    }

    // Continue or not

    if (cont) {
        this.cur = chainLink.seed
        this.doTrace()
        return
    } else {
        return
    }
}

WikipediaTracer.prototype.analyzeContent = function () {

    if (this._text.length == 0) {

        // This article doesn't have an introduction. Nope out, and this time set the
        // _tryRvSection variable. doTrace will detect it and try a higher section number

        if (!this._tryRvSection) {
            this._tryRvSection = 1
        } else {
            this._tryRvSection += 1
        }
        this.doTrace()
        return
    }

    // Make a jquery object out of the retrieved content
    var doc = $("<html>").html(this._text)

    var i = 0
    var j = 0

    // Remove useless classes
    for (i = 0; i < taglist.length; i ++) {
        $(doc).find(taglist[i]).remove()
    }

    // Get the <p> and <ul> elements, they will contain the first link
    var pchild = $(doc).find("p,ul")

    // Search each element for a link. If we find one, go ahead and send the proposed chain element to compare/continue
    for (i = 0; i < pchild.length; i ++) {
        var cl = this.searchElement(pchild[i])
        if (cl) {
            this.compareAndContinue(cl)
            return
        }
    }

    // If that didn't work... try table data tags...

    pchild = $(doc).find("td")

    for (i = 0; i < pchild.length; i ++) {
        var cl = this.searchElement(pchild[i])
        if (cl) {
            this.compareAndContinue(cl)
            return
        }
    }

    // If we get here, that means all else failed. Up the rvSection

    if (!this._tryRvSection) {
        this._tryRvSection = 1
    } else {
        this._tryRvSection += 1
    }
    this.doTrace()
    return

}