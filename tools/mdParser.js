fs=require('fs');

const ROOT= "../"
const MAIN_INPUT = ROOT+"README.md"
const MAIN_OUTPUT = ROOT+"page/src/misc/all-events.json"
const CFP_OUTPUT = ROOT+"page/src/misc/all-cfps.json"
const MONTHS_NAMES = "January,February,March,April,May,June,July,August,September,October,November,December".split(',')

//eg: " * [2017](archives/2017.md)"
const archiveFinderPattern = "^\s*\*\s*\[.*\](archives/(.*)\.md)\s*$"

const extractArchiveFiles = markdown => 
    [...markdown.matchAll(/^\s*\*\s*\[.*\]\(archives\/.*\.md\)\s*$/gm)].map( match => match[0])
    .map( archiveLine => ROOT + archiveLine.trim().replaceAll(/^.*(archives\/.*\.md).*$/g,'$1'));

const extractConfs = markdown => 
    extractYearBlocks(markdown).flatMap(y => 
        extractMonthBlocks(y.markdown).flatMap(m=>
            extractEvents(m.markdown,y.year,m.month)
        )
    )

const extractYearBlocks = markdown => {
    const years = [...markdown.matchAll(/^## \d+$/gm)].map(m=>({
        start:m.index,
        year:m[0].replaceAll(/^\D*(\d+)\D*$/g,'$1')
    }))
    if(!years) return
    for (let index = 0; index < years.length-1; index++) {
        const year = years[index];
        year.markdown = markdown.slice(year.start,years[index+1].start)
    }
    const lastYear=years[years.length-1]
    lastYear.markdown = markdown.slice(lastYear.start)
    return years
}

const extractMonthBlocks = yearMarkdown => {
    const months = [...yearMarkdown.matchAll(/^### \w+$/gm)].map(m=>({
        start:m.index,
        month_en:m[0].replaceAll(/^\W*(\w+)\W*$/g,'$1')
    })).map(month => ({
        ...month,
        month: MONTHS_NAMES.indexOf(month.month_en)
    }))
    if(!months) return
    for (let index = 0; index < months.length-1; index++) {
        const month = months[index];
        month.markdown = yearMarkdown.slice(month.start,months[index+1].start)
    }
    const lastMonth=months[months.length-1]
    lastMonth.markdown = yearMarkdown.slice(lastMonth.start)
    return months
}

const extractEvents = (monthMarkdown,year,month) => 
    // '* 31-03/02: [SnowCamp](https://snowcamp.io/fr/) - Grenoble (France)\n'
    monthMarkdown.match(/^\s*\*\s*(\[[^\]]*\])?\s*[0-9\/-]+:?.*$/gm).map(eventLine => ({
        "name": eventLine.trim().replaceAll(/^.*[?0-9\/-]+.*\[(.*)\].*$/g,'$1'),
		"date": getTimeSpan(year,month,eventLine.trim().replaceAll(/^\s*\*\s*([0-9\/-]*).*$/g,'$1')),
		"hyperlink": eventLine.trim().replaceAll(/^.*\]\(([^)]*)\).*$/g,'$1'),
		"location": eventLine.trim().replaceAll(/^[^)]*[\W-]*([^<]*).*$/g,'$1').trim(),
		"misc": eventLine.includes('</a>')?eventLine.trim().replaceAll(/^.*(<a.*a>).*$/g,'$1'):"",
        "cfp": extractCfp(eventLine.trim().replaceAll(/^.*(<a.*a>).*$/g,'$1')),
        "status": eventLine.trim().startsWith("* [")?eventLine.trim().replaceAll(/^[^[]*\[([\w\s]*)\].*$/g,'$1'):"open"
    }))
const getTimeSpan = (year,month,datespan) => {
    const [startDay,endDay] = datespan.split('-').map(d=>d.trim())
    if(!endDay){
        return [ new Date(year,month,+startDay,0,0,0).getTime()]
    }
    if(endDay.includes('/')){ //event ends next month "31-02/04"
        return [ new Date(year,month,+startDay,0,0,0).getTime(), new Date(year,month+1,+endDay.split('/')[0],0,0,0).getTime()]
    }
    if(+startDay > +endDay){//event ends next month "31-02"
        return [ new Date(year,month,+startDay,0,0,0).getTime(), new Date(year,month+1,+endDay,0,0,0).getTime()]
    }
    return [ new Date(year,month,+startDay,0,0,0).getTime(), new Date(year,month,+endDay,0,0,0).getTime()]
}
const extractCfp = shieldCode => {
    if(!shieldCode.includes("shields.io")) return {}
    const label = shieldCode.replaceAll(/^.*label=([^&]*)&.*$/g,'$1')
    if(!label.match(/cfp/i)) return {}

    const untilStr = decodeURI(shieldCode.replaceAll(/^.*&message=([^&]*)&.*$/g,'$1')).replaceAll("until","").trim();
    const untilDate = new Date(
        untilStr.replaceAll(/^.*(\d{4})$/g,'$1'),
        MONTHS_NAMES.indexOf(untilStr.replaceAll(/[^a-zA-Z]/g,'')),
        untilStr.replaceAll(/^(\d*).*$/g,'$1')+1,
        0,0,0
    ).getTime()
    
    return {
        link:shieldCode.includes("href=")?shieldCode.replaceAll(/^.*href="([^"]*)".*$/g,'$1'):"",
        until:untilStr,
        untilDate:untilDate
    }
}

//main file parsing
const mainContent = fs.readFileSync(MAIN_INPUT).toString();
const currentConfs = extractConfs(mainContent);


//archives parsing
const archives = extractArchiveFiles(mainContent);
const archiveConfs = archives.flatMap( archive => extractConfs(fs.readFileSync(archive).toString()))


//aggregation
const allConfs = archiveConfs.concat(currentConfs);
fs.writeFileSync(MAIN_OUTPUT,JSON.stringify(allConfs));

const allCFPs = allConfs.filter(conf => conf.cfp.untilDate).map(conf => ({
    ...conf.cfp,
    conf: {
        name:conf.name,
        date:conf.date,
        hyperlink:conf.hyperlink,
        status:conf.status,
        location:conf.location,
    }
})).sort( (a,b)=> a.untilDate-b.untilDate)
fs.writeFileSync(CFP_OUTPUT,JSON.stringify(allCFPs));
