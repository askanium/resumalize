'use strict';

var resumalize = function(container, configuration) {
    var that = {};
    var config = {
        chartHeight					: 200,
        slopeChartHeight			: 200,
        slopeLeftMargin 			: 30,
        margin                      : {top: 10, right: 20, bottom: 30, left: 20},
        mainChartPercentageWidth    : 1,
        minGapWidth                 : 200,

        transitionMs				: 4000,
        xTickFormat					: d3.time.format('%Y'),

        workItemsLabel              : 'work',
        learningItemsLabel          : 'learning',
        noEndDateCharacter          : '-',
        theoreticalKnowledgeLvl     : 'theoretical',
        practicalKnowledgeLvl       : 'practical',
        bothKnowledgeLvl            : 'both'

    };

    var width = undefined;
    var height = undefined;

    var minDate = new Date().toJSON();
    var maxDate = '1970-01-01';
    var currentDate = new Date();

    var itemProps = [config.workItemsLabel, config.learningItemsLabel];
    var colors = {
        'working': ['#FFB74D', '#FF8A65', '#FFA726', '#FF7043', '#FF9800', '#FF5722', '#FB8C00', '#F4511E', '#F57C00', '#E64A19'],
        'learning': ['#81D4FA', '#90CAF9', '#4FC3F7', '#64B5F6', '#29B6F6', '#42A5F5', '#03A9F4', '#2196F3', '#039BE5', '#1E88E5']
    };
    var workingColors = d3.scale.ordinal().range(colors.working);
    var learningColors = d3.scale.ordinal().range(colors.learning);
    var availableLayers = {};
    availableLayers[config.workItemsLabel] = {};
    availableLayers[config.learningItemsLabel] = {};

    var svg = undefined;

    var x = undefined;
    var y = undefined;
    var itemAreasGenerator = undefined;
    var tooltip = undefined;

    var tech = [];

    var xAxis = undefined;
    var yAxis = undefined;
    var timeLineTickValues = undefined;

    var placeTitleDom = undefined;
    var placeDetailsDom = undefined;

    var workplace = undefined;
    var learningPlace = undefined;
    var technologiesSvg = undefined;
    var timeline = undefined;
    var timelineYearValues = undefined;

    // Slope graph
    var r2pSlopegraph = undefined;
    var leftScale = undefined;
    var rightScale = undefined;
    var bottomScale = undefined;
    var leftScaleAxis = undefined;
    var rightScaleAxis = undefined;
    var bottomScaleAxis = undefined;

    /**
     * Create an array of years between 2 provided date strings.
     * @param {string} minDate - A data in format 'YYYY-MM-DD'
     * @param {string} maxDate - A data in format 'YYYY-MM-DD'
     * @returns {Array} The array with years.
     */
    function getYearDatesBetweenTwoDates ( minDate, maxDate ) {
        var minDateYear = parseInt(minDate);
        var maxDateYear = parseInt(maxDate);
        var result = [];

        for ( var i = minDateYear; i <= maxDateYear; i++ ) {
            result.push(new Date(Date.UTC(i, 0, 1)));
        }

        return result;
    }

    /**
     * Extract from the data the max and min dates that will serve as starting and ending dates of the chart.
     * @param {Object} data - The resume data.
     */
    function extractMinAndMaxDates ( data ) {
        itemProps.forEach(function (prop) {
            data[prop] = data[prop] || [];
            data[prop].forEach(function ( xpItem ) {
                minDate = minDate > xpItem.dateStart ? xpItem.dateStart : minDate;
                maxDate = xpItem.dateEnd === config.noEndDateCharacter
                    ? currentDate.toJSON()
                    : (maxDate < xpItem.dateEnd
                        ? xpItem.dateEnd
                        : maxDate);
            });
        });
        minDate = new Date(parseInt(minDate), 0, 1, 12, 0, 1).toJSON();  // To account for timezones. Otherwise it can go a year before.
    }

    /**
     * Compute the coordinates required for drawing a path for either a work place or a learning place. The face2face
     * learning places and paid jobs are drawn in a trapezoidal form, while the other items are drawn in a rectangular form.
     * @param {Object} item - The work/learning place item from the resume data.
     * @param {string} prop - The type of item that is either work or learning.
     * @returns {Array} A list of objects with data required to build an svg path.
     */
    function getAreaObjectForItem ( item, prop ) {
        var dateStart = new Date(item.dateStart),
            startAsc = new Date(item.dateStart),
            dateEnd = item.dateEnd === config.noEndDateCharacter ? currentDate : new Date(item.dateEnd),
            endAsc = item.dateEnd === config.noEndDateCharacter ? currentDate : new Date(item.dateEnd),
            areaObjPoints = [],
            nrOfDays = 0,
            layer = 0,
            coeff,
            baseYPos = prop === config.workItemsLabel ? 4 : -4,
            yOffset = prop === config.workItemsLabel ? 14 : -14;

        // Paid jobs and face2face learning places will be drawn in a trapezoidal form, while the rest in a restangular form.
        switch ( item.type ) {
            case 'paidJob':
            case 'face2face':
                nrOfDays = 75;
                break;
            case 'volunteering':
            case 'online':
                nrOfDays = 0;
        }

        // Loop over available layers until the layer on which the item should be drawn is found.
        while (true) {
            // If there is no such layer yet, create a property with this layer, set its value to `endDate` and break loop.
            if ( !availableLayers[prop].hasOwnProperty(layer.toString()) ) {
                availableLayers[prop][layer.toString()] = dateEnd;
                break;

            } else {
                // If `dateStart` is less than the date of the layer, this means that the item area begins before
                // the item on the current level ends, which means that the current item should be drawn higher, thus
                // increase the layer on which it will be placed.
                if ( dateStart < availableLayers[prop][layer.toString()] ) {
                    layer += 1;
                } else {

                    // In case the `dateStart` is bigger than the date on which the layer ends, set current item's
                    // `dateEnd` as the new ending date for this layer.
                    availableLayers[prop][layer.toString()] = dateEnd;
                    break;
                }
            }
        }

        // Compute the coefficient that will keep the 'slope' of trapezoidal paths to have the same angle for different layers.
        coeff = layer === 0 ? 1 : (layer * 5 + 10) / (layer * 5 + 5);

        // Set the date that corresponds to the top left corner of the trapezoidal form.
        startAsc.setDate(startAsc.getDate() + nrOfDays * coeff);

        // In case the work/learning place has not finished (current working/learning place), do not draw it in
        // a trapezoidal form so as to show an ongoing experience.
        if ( item.dateEnd === '-' ) nrOfDays = 0;

        // Set the date that corresponds to the top right corner of the trapezoidal form.
        endAsc.setDate(endAsc.getDate() - nrOfDays * coeff);

        areaObjPoints.push({date: dateStart, y: baseYPos});
        areaObjPoints.push({date: startAsc, y: yOffset + (layer * baseYPos)});
        areaObjPoints.push({date: endAsc, y: yOffset + (layer * baseYPos)});
        areaObjPoints.push({date: dateEnd, y: baseYPos});

        item.layer = layer;

        return areaObjPoints;
    }

    function dataPreparation ( data ) {

        /**
         * Helper function to compare 2 objects based on a provided prop.
         * @param {Object} prop - The property name of the object which's value is to be compared.
         * @param {Boolean} desc - The sorting order.
         * @returns {compare} The comparing function based on the provided property.
         */
        function compareDataPoints ( prop, desc ) {

            function compare ( a, b ) {
                var result = a[prop] < b[prop]
                    ? -1
                    : (a[prop] > b[prop] ? 1 : 0);
                return result * sortOrder;
            }
            var sortOrder = desc ? -1 : 1;

            return compare;
        }

        /**
         * Process each responsibility of a working/learning place to obtain the data for the "responsibilities to
         * problems addressed" chart.
         * @param {Object} item - The place of work/volunteering/learning.
         * @param {string} itemType - The type of item (work or learning).
         */
        function processResponsibilities ( item, itemType ) {

            /**
             * Get the knowledge level of the technologies in the current item.
             * @param {string} itemType - The type of item (work or learning).
             * @param {string} currentLvl - The level at which a technology is known.
             * @returns {string} The updated level of knowledge of a technology.
             */
            function getKnowledgeLvl ( itemType, currentLvl ) {
                var result = currentLvl;
                // If no currentLvl, this means it's a new technology. Assign the lvl based on item type.
                if ( currentLvl === undefined ) {
                    result = itemType === config.workItemsLabel
                        ? config.practicalKnowledgeLvl
                        : config.theoreticalKnowledgeLvl;

                // Otherwise, if current lvl is theoretical, but there's a practical xp item
                // switch the current lvl to practical
                } else if ( currentLvl === config.theoreticalKnowledgeLvl && itemType === config.workItemsLabel ) {
                    result = config.practicalKnowledgeLvl;
                }
                return result;
            }

            /**
             * Map the responsibilities present in an item with the problems addressed at the same item.
             * @param {Object} responsibility - The responsibility item of a working/learning place.
             * @param {Array} slopeChartData - The data for the slope chart.
             * @param {Array} addressedProblems - The array of the addressed problems.
             */
            function mapResponsibilitiesToProblemsAddressed ( responsibility, slopeChartData, addressedProblems ) {
                // For each addressed problem in the responsibility item, add the connection "responsibility - problem"
                // to the slope chart data.
                responsibility.problemsAddressed.forEach(function ( addressedProblem ) {
                    slopeChartData.push([responsibility.title, addressedProblem]);

                    // If the addressed problem is a new one, add it to the list of all addressed problems,
                    // which later will be visualized on the right side of the slope chart.
                    if ( addressedProblems.indexOf(addressedProblem) === -1 ) {
                        addressedProblems.push(addressedProblem);
                    }
                });
            }

            function updateTechs ( responsibility, dateStart, itemType ) {

                function updateChildrenTechs ( parentTech, newTechs, knowledgeLvl, startDate, endDate ) {
                    newTechs.forEach(function(newTech) {

                        // Search if the child tech exists within the core technology.
                        var existingFilteredTechList = parentTech.children.filter(function (tech) {
                            return tech.name === newTech;
                        });

                        // If it is a new child tech, add it to the parent tech.
                        if ( existingFilteredTechList.length === 0 ) {
                            parentTech.children.push({
                                name: newTech,
                                knowledgeLvl: knowledgeLvl,
                                startEndDatePairs: [[startDate, endDate]]
                            });
                        } else {
                            // In case the child tech exists already, add dates of working and update knowledge level.
                            existingFilteredTechList[0].startEndDatePairs.push([startDate, endDate]);
                            existingFilteredTechList[0].knowledgeLvl = knowledgeLvl;
                        }
                    });
                }

                // For each technology present in a responsibility object, update the known technologies,
                // their knowledge levels and child technologies.
                for (var technology in responsibility.tech) {
                    if ( responsibility.tech.hasOwnProperty(technology) ) {
                        var techIsAlreadySaved = false;

                        // For each saved technology, check if the given technology matches. If so, mark the
                        // tech as already saved so that it won't be added again and update its knowledge level,
                        // start date and child technology details.
                        tech.forEach(function ( savedTech ) {
                            if ( savedTech.name === technology ) {
                                techIsAlreadySaved = true;

                                // Update the knowledge level.
                                savedTech.knowledgeLvl = getKnowledgeLvl(itemType, savedTech.knowledgeLvl);

                                // Update starting year of using the technology.
                                if ( savedTech.yearStarted > new Date(dateStart) ) {
                                    savedTech.yearStarted = new Date(dateStart);
                                }

                                // Update child technologies and their knowledge levels.
                                updateChildrenTechs(savedTech, responsibility.tech[technology], savedTech.knowledgeLvl, responsibility.dateStart, responsibility.dateEnd);
                            }
                        });

                        // If the given technology is a new one, save it and update child techs for it.
                        if ( !techIsAlreadySaved ) {
                            var newTech = {
                                name: technology,
                                knowledgeLvl: getKnowledgeLvl(itemType),
                                yearStarted: new Date(dateStart),
                                children: []
                            };

                            tech.push(newTech);

                            // Update child technologies and their knowledge levels.
                            updateChildrenTechs(newTech, responsibility.tech[technology], newTech.knowledgeLvl, responsibility.dateStart, responsibility.dateEnd);
                        }
                    }
                }
            }

            // TODO compute period based on all experiences (that might overlap)
            var period = new Date(item.dateEnd).getTime() - new Date(item.dateStart).getTime();
            // Initialize the object where the mapping will live.
            item.slopeChartData = [];
            item.addressedProblems = [];
            if ( item.responsibilities && item.responsibilities.length ) {
                item.responsibilities.forEach(function ( responsibility ) {
                    // Update person's technologies
                    if ( responsibility.tech ) {
                        updateTechs(responsibility, item.dateStart, itemType);
                    }
                    if ( responsibility.problemsAddressed && responsibility.problemsAddressed.length ) {
                        mapResponsibilitiesToProblemsAddressed(responsibility, item.slopeChartData, item.addressedProblems);
                    }
                })
            }
        }

        ///////////////////////////////////////////////////////////////////////////////
        // Here starts the data preparation process, that consists of several steps. //
        ///////////////////////////////////////////////////////////////////////////////

        // 1. Extract min and max dates to know how many years to draw on the timeline.
        extractMinAndMaxDates(data);

        itemProps.forEach(function (prop) {
            data[prop] = data[prop] || [];

            // 2. For each type of item (work/learning), sort the data according to its start date.
            data[prop] = data[prop].sort(compareDataPoints('dateStart'));

            // 3. For each work/learning item, generate chart coordinates where it'll be placed on the timeline.
            data[prop].forEach(function ( xpItem ) {
                xpItem.chartCoords = getAreaObjectForItem(xpItem, prop);

                // 4. Process responsibilities to gather data for the slope and tech stack charts.
                processResponsibilities(xpItem, prop);
            });

            // 5. After processing the data, sort it according to layers in order to display them nicely on the chart.
            data[prop] = data[prop].sort(compareDataPoints('layer', true));
        });
    }

    function formatDate ( date ) {
        var monthNamesShort = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return date === config.noEndDateCharacter ? 'present' : monthNamesShort[parseInt(date.substr(5, 2))] + ' ' + date.substr(0, 4);
    }

    /**
     * Get the html content for the tooltip.
     * @param {Object} item - The work/learning item from resumalize data.
     * @returns {string} The html content to be inserted into the tooltip.
     */
    function getTooltipHtml ( item ) {
        var startDate = formatDate(item.dateStart);
        var endDate = formatDate(item.dateEnd);
        var result = '<div class="title"><strong>' + item.title + '</strong></div>' +
                '<div><strong>Place: </strong>' + item.place + '</div>' +
                '<div><strong>Period: </strong>' + startDate + ' — ' + endDate + '</div>';

        if ( item.course ) {
            result += '<div><strong>Course: </strong>' + item.course + '</div>';
        }
        if ( item.specialty ) {
            result += '<div><strong>Specialty: </strong>' + item.specialty + '</div>';
        }
        if ( item.keyFigures && item.keyFigures.length ) {
            result += '<div><strong>Key figures: </strong></div>';
            result += '<ul>';
            item.keyFigures.forEach(function (keyFigure) {
                result += '<li>' + keyFigure + '</li>';
            });
            result += '</ul>';
        }

        return result;
    }

    /**
     * Either draw a slope chart with the responsibilities that map to the problems addressed, or display a table with
     * all the responsibilities and their corresponding achievements, depending on what data is available.
     * @param {Object} item - The work/learning item data from the resumalize data.
     */
    function updateItemResponsibilityDetails ( item ) {

        // Example taken from https://bl.ocks.org/mbostock/7555321 and adjusted for labels placed in a column.
        function wrap ( text, width, side ) {
            text.each(function() {
                var tspanElements = [];
                var text = d3.select(this),
                    words = text.text().split(/\s+/).reverse(),
                    word,
                    line = [],
                    y = text.attr("y"),
                    dy = parseFloat(text.attr("dy")),
                    tspan = text.text(null).append("tspan").attr("x", side * 9).attr("y", y).attr("dy", dy + "em");
                    tspanElements.push(tspan);
                while (word = words.pop()) {
                    line.push(word);
                    tspan.text(line.join(" "));
                    if (tspan.node().getComputedTextLength() > width) {
                        line.pop();
                        tspan.text(line.join(" "));
                        line = [word];
                        tspan.attr('dy', dy + 'em');  // We do not change `dy` attr, thus stacking all tspan elements one on top of the other. The adjustment will be made later.
                        tspan = text.append("tspan").attr("x", side * 9).attr("y", y).attr("dy", dy + "em").text(word);
                        tspanElements.push(tspan);  // Add tspan elements for vertical adjustment later on
                    }
                }

                // If we have more than 1 tspan element, we need to adjust their `dy` attribute (as currently they are all one on top of the other
                if ( tspanElements.length > 1 ) {

                    // Check if the number of lines of the label is odd.
                    var isOdd = tspanElements.length % 2 !== 0;

                    // The distance between rows based on the number of rows of the label.
                    var distanceBetweenElements = 1 / tspanElements.length;

                    // In case it is odd, compute as the middle `dy` prop to be 1/n, whereas if nr of lines is even,
                    // this means that the middle `dy` value for the label is "between the lines", and thus we compute
                    // the middle value as 1/(n*2). For instance, for odd number of lines we have:
                    //     line1 (dy = 0)
                    //     line2 (dy = .33)   <-- middle, computed as 1/3
                    //     line3 (dy = .66)
                    // And for even nr of lines:
                    //     line1 (dy = 0)
                    //           (dy = 0.25)  <-- middle, computed as 1/4
                    //     line2 (dy = 0.5)
                    var middleDy = isOdd ? 1 / tspanElements.length : (1 - 1 / tspanElements.length) / 2;

                    // Compute the middle index so as to know for which rows to subtract and for which rows to add the offset.
                    // Here, in case it is odd, the middle index will be the middle index value in tspanElements list (for a list
                    // of 3 elements ([0, 1, 2]) the middle index will be 1), whereas if it is even, the middle index will be
                    // the middle between the 2 adjacent indexes in the middle (for a list of 2 elements ([0, 1]), the middle
                    // index will be 0.5. See below why this matters.
                    var middleIndex = isOdd ? Math.floor(tspanElements.length / 2) : tspanElements.length / 2 - .5;

                    //// Adjustment for when there are an even number of rows for a label.
                    //var adjustForEvenNrOfRows = isOdd ? 0 : 0;

                    tspanElements.forEach(function (tspan, i) {
                        // Initialize the offset value.
                        var offsetDy = 0;
                        if ( i < middleIndex ) {
                            // If i is less than middle index, we need to push the tspan element up, thus we subtract from the
                            // middleDy value the position of this row from the center (middleIndex - i) times the number of
                            // rows of the current label times the middleDy value.
                            // Example (odd rows):
                            // i = 0 --> line1
                            //           line2 <-- middleDy = 0.33, middleIndex = 1
                            //           line3
                            // middleIndex - i = 1 - 0 = 1 (the current row is placed 1 rows above the middle index)
                            // offsetDy = 0.33 - 1 * 3 * 0.33 = 0.33 - 1 = -0.66 (we need to push the current row -0.66em units (up direction).
                            //
                            // Example (even rows):
                            // i = 0 --> line1
                            //                 <-- middleDy = 0.25, middleIndex = 0.5
                            //           line2
                            // middleIndex - i = 0.5 - 0 = 0.5 (the current row is placed 0.5 rows above the middle index)
                            // offsetDy = 0.25 - 0.5 * 2 * 0.5 = 0.25 - 0.5 = -0.25 (we need to push the current row -0.25em units (up direction).
                            offsetDy = middleDy - (middleIndex - i) * tspanElements.length * distanceBetweenElements;
                        } else {
                            // The same logic applies when the ith row is greater than the middleIndex. Here all the rows are
                            // shifted below the middleDy value.
                            offsetDy = middleDy + (i - middleIndex) * tspanElements.length * distanceBetweenElements;
                        }
                        tspan.attr('dy', offsetDy + 'em');
                    })
                }
            });
        }

        /**
         * Compute the left and right margins necessary to display each label in one row.
         * @param item
         * @returns {{left: number, right: number}}
         */
        function computeMargins ( item ) {

            /**
             * Compute the necessary width in pixels for a list of labels.
             * @param {Array} listOfLabels - An array of list of labels that are strings.
             * @returns {number} The max width necessary to display the longest label.
             */
            function computeMargin ( listOfLabels ) {
                var margin = 0;

                listOfLabels.forEach(function (label) {
                    var textWidth;

                    var labelMeter = r2pSlopegraph.selectAll('.labelMeter')
                        .data([label])
                        .enter()
                        .append('text')
                        .attr('class', 'labelMeter')
                        .attr('x', 0)
                        .attr('y', 0)
                        .text(label);

                    textWidth = labelMeter[0][0].getComputedTextLength();
                    if ( margin < textWidth ) {
                        margin = textWidth;
                    }

                    r2pSlopegraph.selectAll('.labelMeter')
                        .data([])
                        .exit()
                        .remove();
                });
                return margin;
            }

            // Compute for left margin
            var leftMargin = computeMargin(item.responsibilities.map(function (r) { return r.title; }));

            // Compute for right margin
            var rightMargin = computeMargin(item.addressedProblems);

            return {
                'left': leftMargin,
                'right': rightMargin
            };
        }

        /**
         * Compute the gap between the left and right axes in the slope chart.
         * First, check whether the left and right margins and the min gap width between them fits the available width of the chart.
         * In case it is wider that the available width, adjust margins accordingly and leave the gap at min width.
         * The algorithm is a simple one: compute the ratio of available width / necessary width and shorten them proportionally.
         * In case the margins are shorter than the available width, compute the gap to fill the available width.
         * @param {Object} margins - The right and left margins necessary to display the slopegraph's labels each per one row.
         * @returns {number} The width of the gap in pixels.
         */
        function checkMarginsAndGetWidth ( margins ) {
            var w = d3.select(container).node().offsetWidth - config.slopeLeftMargin;
            var slopeChartWidth = config.minGapWidth;
            if ( w < margins.right + margins.left + config.minGapWidth ) {
                var ratio = (w - config.minGapWidth - 20) / (margins.right + margins.left);  // subtract 20 to account for labels margin from the axis line
                margins.right *= ratio;
                margins.left *= ratio;
            } else {
                slopeChartWidth = w - margins.right - margins.left - config.slopeLeftMargin;
            }
            return slopeChartWidth;
        }

        /**
         * Draws a slope chart that visualizes the connection between the responsibilities and problems addressed by them.
         * @param {Object} item - An experience item from the resumalize json data.
         */
        function drawSlopeChart ( item ) {
            var slopeChartMargins = computeMargins(item);
            var slopeChartWidth = checkMarginsAndGetWidth(slopeChartMargins);
            var responsibilityTitles = item.responsibilities.map(function (d) { return d.title; });
            var maxNrOfLabels = responsibilityTitles.length > item.addressedProblems.length
                ? responsibilityTitles.length
                : item.addressedProblems.length;
            config.slopeChartHeight = 40 * maxNrOfLabels;
            leftScale.domain(responsibilityTitles).rangeRoundBands([0, config.slopeChartHeight - config.margin.top - config.margin.bottom], .3);
            rightScale.domain(item.addressedProblems).rangeRoundBands([0, config.slopeChartHeight - config.margin.top - config.margin.bottom], .3);

            bottomScale.range([0, slopeChartWidth]);

            d3.select('.r2pSlopegraph').attr('height', config.slopeChartHeight + 'px');

            var r2pG = r2pSlopegraph.append('g')
                .attr('class', 'g_slope')
                .attr('transform', 'translate(' + (slopeChartMargins.left + config.slopeLeftMargin) + ',25)');

            r2pG.append('text')
                .attr('x', bottomScale(0) - 9)
                .attr('y', -5)
                .attr('class', 'slope-chart-label')
                .style('text-anchor', 'end')
                .text('Responsibilities');

            r2pG.append('text')
                .attr('x', bottomScale(1) + 9)
                .attr('y', -5)
                .attr('class', 'slope-chart-label')
                .text('Problems addressed');

            r2pG.append("g")
                .attr("class", "y slope-left-axis")
                .attr("transform", "translate(0,0)")
                .call(leftScaleAxis)
                .selectAll(".tick text")
                .call(wrap, slopeChartMargins.left, -1)
                .on('mouseover', function (d) {
                    var leftLabels = d3.selectAll('.slope-left-axis .tick text');
                    var rightLabels = d3.selectAll('.slope-right-axis .tick text');
                    var emphasizedSlopeLines = item.slopeChartData.filter(function (x) { return x[0] === d; });
                    var rightEmphasizedLabels = emphasizedSlopeLines.map(function (x) { return x[1]; });

                    leftLabels.filter(function (x) { return d !== x; })
                        .style('opacity', '0.3');

                    rightLabels.filter(function (x) { return rightEmphasizedLabels.indexOf(x) === -1; })
                        .style('opacity', '0.3');

                    r2pSlopegraph.selectAll('.slope-line')
                        .data(item.slopeChartData)
                        .filter(function (x) { return x[0] !== d; })
                        .style('stroke', '#ddd');
                })
                .on('mouseout', function () {
                    d3.selectAll('.slope-left-axis .tick text').style('opacity', '1 ');
                    d3.selectAll('.slope-right-axis .tick text').style('opacity', '1 ');
                    d3.selectAll('.slope-line').style('stroke', '#999');
                });

            r2pG.append("g")
                .attr("class", "y slope-right-axis")
                .attr("transform", "translate(" + slopeChartWidth + ",0)")
                .call(rightScaleAxis)
                .selectAll(".tick text")
                .call(wrap, slopeChartMargins.right, 1)
                .on('mouseover', function (d) {
                    var leftLabels = d3.selectAll('.slope-left-axis .tick text');
                    var rightLabels = d3.selectAll('.slope-right-axis .tick text');
                    var emphasizedSlopeLines = item.slopeChartData.filter(function (x) { return x[1] === d; });
                    var leftEmphasizedLabels = emphasizedSlopeLines.map(function (x) { return x[0]; });

                    leftLabels.filter(function (x) { return leftEmphasizedLabels.indexOf(x) === -1; })
                        .style('opacity', '0.3');

                    rightLabels.filter(function (x) { return d !== x; })
                        .style('opacity', '0.3');

                    r2pSlopegraph.selectAll('.slope-line')
                        .data(item.slopeChartData)
                        .filter(function (x) { return x[1] !== d; })
                        .style('stroke', '#ddd');
                })
                .on('mouseout', function () {
                    d3.selectAll('.slope-left-axis .tick text').style('opacity', '1');
                    d3.selectAll('.slope-right-axis .tick text').style('opacity', '1');
                    d3.selectAll('.slope-line').style('stroke', '#999');
                });

            r2pG.selectAll('.slope-line')
                .data(item.slopeChartData)
                .enter()
                .append('line')
                .attr('class', 'slope-line')
                .attr('x1', 0)
                .attr('y1', function (d) { return leftScale(d[0]) + leftScale.rangeBand() / 2; })
                .attr('x2', slopeChartWidth)
                .attr('y2', function (d) { return rightScale(d[1]) + rightScale.rangeBand() / 2; });
        }

        /**
         * Update the text details of the work/learning item.
         * @param {Array} responsibilities - The array of the responsibilities of the work/learning item.
         */
        function updateResponsibilityDetails ( responsibilities ) {

            if ( responsibilities && responsibilities.length ) {
                var headerDiv = placeDetailsDom.append('div').attr('class', 'responsibility-header');
                headerDiv.append('div').attr('class', 'responsibility-title').html('Responsibility');
                headerDiv.append('div').attr('class', 'responsibility-description').style('font-weight', 700).html('Description');
                headerDiv.append('div').attr('class', 'responsibility-achievements').style('font-weight', 700).html('Achievements');

                responsibilities.forEach(function (responsibility) {
                    var responsibilityRow = placeDetailsDom.append('div')
                        .attr('class', 'responsibility-row');

                    responsibilityRow.append('div')
                        .attr('class', 'responsibility-title')
                        .html(responsibility.title);

                    responsibilityRow.append('div')
                        .attr('class', 'responsibility-description')
                        .html(responsibility.description);

                    var achievements = responsibilityRow.append('div')
                        .attr('class', 'responsibility-achievements');

                    if ( responsibility.achievements && responsibility.achievements.length ) {
                        var list = achievements.append('ul');
                        responsibility.achievements.forEach(function (achievement) {
                            list.append('li').html(achievement);
                        });
                    }
                });
            }
        }

        // Remove any chart that was there.
        r2pSlopegraph.select('.g_slope').remove();

        // Remove any text details that were there.
        placeDetailsDom.selectAll('*').remove();

        // If there exist addressed problems, draw the slope chart, otherwise, display the details of the item as a table.
        if ( item.addressedProblems.length ) {
            drawSlopeChart(item);
        } else {
            updateResponsibilityDetails(item.responsibilities);
        }

    }

    function configure ( configuration ) {
        var prop;
        for ( prop in configuration ) {
            if ( configuration.hasOwnProperty(prop) ) {
                config[prop] = configuration[prop];
            }
        }

        width = (d3.select(container).node().offsetWidth - config.margin.left - config.margin.right) * config.mainChartPercentageWidth;
        height = config.chartHeight - config.margin.top - config.margin.bottom;

        x = d3.time.scale()
            .range([config.margin.left, width - config.margin.right])
            .domain([new Date(minDate), new Date(maxDate)]);

        y = d3.scale.linear()
            .range([height, 0])
            .domain([-20, 30]);

        itemAreasGenerator = d3.svg.line()
            .x(function (d) {
                return Math.ceil(x(new Date(d.date)));
            })
            .y(function (d) {
                return Math.ceil(y(d.y));
            });

        timeLineTickValues = getYearDatesBetweenTwoDates(minDate, maxDate);

        xAxis = d3.svg.axis()
            .scale(x)
            .orient('bottom');
            //.tickValues(timeLineTickValues)
            //.tickFormat(config.xTickFormat);

        yAxis = d3.svg.axis()
            .scale(y)
            .orient('left');

        if ( !tooltip )
            tooltip = d3.select("body")
                .append("div")
                .attr('class','tooltip')
                .style("position", "absolute")
                .style("z-index", "11")
                .style("visibility", "hidden")
                .text("");

        leftScale = d3.scale.ordinal();
        rightScale = d3.scale.ordinal();
        bottomScale = d3.scale.linear().domain([0, 1]);

        leftScaleAxis = d3.svg.axis()
            .scale(leftScale)
            .orient('left');

        rightScaleAxis = d3.svg.axis()
            .scale(rightScale)
            .orient('right');

        bottomScaleAxis = d3.svg.axis()
            .scale(bottomScale)
            .orient('bottom');

    }
    that.configure = configure;

    function isRendered() {
        return (svg !== undefined);
    }
    that.isRendered = isRendered;

    function render ( data ) {
        svg = d3.select(container)
            .append('svg:svg')
            .attr('class', 'resumalize')
            .attr('width', function () { return config.mainChartPercentageWidth * 100 + '%'; })
            .attr('height', config.chartHeight + 'px')
            .append('g')
            .attr('class', 'g_resumalize')
            .attr('transform', 'translate(' + config.margin.left + ',' + config.margin.top + ')');

        // TODO add technologies chart
        //technologiesSvg = d3.select()
        //    .append('svg:svg')
        //    .attr('class', 'technologies')
        //    .attr('width', function () { return (1 - config.mainChartPercentageWidth) * 100 + '%'; })
        //    .attr('height', config.chartHeight + 'px')
        //    .append('g')
        //    .attr('class', 'g_technologies')
        //    .attr('transform', 'translate(' + config.margin.left + ',' + config.margin.top + ')');

        placeTitleDom = d3.select(container)
            .append('div')
            .attr('id', 'placeTitle')
            .style('margin-left', 2 * config.margin.left + 'px');

        placeDetailsDom = d3.select(container)
            .append('div')
            .attr('id', 'placeDetails')
            .style('margin-left', 2 * config.margin.left + 'px');

        r2pSlopegraph = d3.select(container)
            .append('svg:svg')
            .attr('class', 'r2pSlopegraph')
            .attr('width', function () { return config.mainChartPercentageWidth * 100 + '%'; })
            .attr('height', config.slopeChartHeight + 'px');

        update(data === undefined ? {} : data, {});
    }
    that.render = render;

    function update ( newData, newConfiguration ) {
        dataPreparation(newData);
        configure(newConfiguration);

        workplace = svg.selectAll('.workplace')
            .data(newData[config.workItemsLabel])
            .enter()
            .append('g')
            .attr('class', 'workplace');

        workplace
            .append('path')
            .attr('class', 'workPolygon')
            .attr('d', function (d) { return d3.roundPathCorners(itemAreasGenerator(d.chartCoords), 5, [x(new Date(maxDate))]); })
            .attr('fill', function (d) { return workingColors(d.title); })
            .attr('stroke-width', 2);

        workplace
            .on('mouseover', function (d) {
                return tooltip.style('border-color', workingColors(d.title))
                    .style("visibility", "visible")
                    .html(getTooltipHtml(d));
            })
            .on("mousemove", function () {
                var item = d3.select(this);
                var coords = d3.mouse(item.node());
                var offsetLeft = d3.select(container).node().offsetLeft;
                var offsetTop = d3.select(container).node().offsetTop;
                return tooltip
                    .style("top", (offsetTop + coords[1] + 10)+"px")
                    .style("left",(offsetLeft + coords[0] + 40)+"px");
            })
            .on("mouseout", function () {
                return tooltip.style("visibility", "hidden");
            })
            .on('click', function (d) {
                d3.selectAll('.selected').remove();
                d3.select(this).append('path')
                    .attr('d', d3.roundPathCorners(itemAreasGenerator(d.chartCoords), 5, [x(new Date(maxDate))]))
                    .attr('class', 'workPolygon selected')
                    .style('fill', 'url(#dots-1) #ddd');
                placeTitleDom.html('<h2>"' + d.title + '" at ' + d.place + '</h2><h3>' + formatDate(d.dateStart) + ' — ' + formatDate(d.dateEnd) + '</h3>');
                updateItemResponsibilityDetails(d);
            });

        learningPlace = svg.selectAll('.learningPlace')
            .data(newData[config.learningItemsLabel])
            .enter()
            .append('g')
            .attr('class', 'learningPlace');

        learningPlace
            .append('path')
            .attr('class', 'learningPolygon')
            .attr('d', function (d) { return d3.roundPathCorners(itemAreasGenerator(d.chartCoords), 5, [x(new Date(maxDate))]); })
            .attr('fill', function (d) {
                return learningColors((d.course || d.place));
            })
            .attr('stroke-width', 2);

        learningPlace
            .on('mouseover', function (d) {
                return tooltip.style('border-color', learningColors((d.course || d.place)))
                    .style("visibility", "visible")
                    .html(getTooltipHtml(d));
            })
            .on("mousemove", function () {
                var item = d3.select(this);
                var coords = d3.mouse(item.node());
                var offsetLeft = d3.select(container).node().offsetLeft;
                var offsetTop = d3.select(container).node().offsetTop;
                return tooltip
                    .style("top", (offsetTop + coords[1] + 10)+"px")
                    .style("left",(offsetLeft + coords[0] + 40)+"px");
            })
            .on("mouseout", function () {
                return tooltip.style("visibility", "hidden");
            })
            .on('click', function (d) {
                d3.selectAll('.selected').remove();
                d3.select(this).append('path')
                    .attr('d', d3.roundPathCorners(itemAreasGenerator(d.chartCoords), 5, [x(new Date(maxDate))]))
                    .attr('class', 'learningPolygon selected')
                    .style('fill', 'url(#dots-1) #ddd');
                placeTitleDom.html('<h2>"' + d.title + '" at ' + d.place + '</h2><h3>' + formatDate(d.dateStart) + ' — ' + formatDate(d.dateEnd) + '</h3>');
                updateItemResponsibilityDetails(d);
            });

        timeline = svg.append('g').attr('class', 'timeline');

        timeline.append('rect')
            .attr('class', 'timeline-rect')
            .attr('x', x(timeLineTickValues[0]))
            .attr('y', y(4))
            .attr('width', function() { return x(new Date(maxDate)) - x(timeLineTickValues[0]); })
            .attr('height', function () { return y(-4) - y(4); });

        timelineYearValues = timeline.selectAll('.year-label')
            .data(timeLineTickValues)
            .enter()
            .append('text')
            .attr('class', 'year-label')
            .attr('x', function (d) { return x(new Date(d.getFullYear(), d.getMonth() + 6, 1)); })
            .attr('y', function () { return y(0); })
            .text(function (d) { return d.getFullYear(); })
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central');

        // Remove the first entry so that we won't have a separator at the beginning of the first year on the timeline.
        var dataForYearSeparators = timeLineTickValues.slice();
        dataForYearSeparators.shift();

        timeline.selectAll('.year-separator')
            .data(dataForYearSeparators)
            .enter()
            .append('rect')
            .attr('class', 'year-separator')
            .attr('x', function (d) { return x(d); })
            .attr('y', y(2))
            .attr('width', 2)
            .attr('height', y(-2) - y(2));

        //svg.append('g')
        //    .attr("class", "x axis")
        //    .attr("transform", "translate(" + config.chartHeight + ",0)")
        //    .call(xAxis);
    }
    that.update = update;

    configure(configuration);

    return that;
};

(function() {
    d3.roundPathCorners = function ( path, radius, xCoordsToIgnore ) {
        var roundedPath = [];
        var separatedCommands = splitPathByCommands(path);
        var xCoordinatesToIgnore = xCoordsToIgnore || [];
        //console.log(separatedCommands);

        var point1, point2, point3, angle;

        separatedCommands.forEach(function (command) {
            var distance = 0, offsetPoint;
            point1 = point2;
            point2 = point3;
            point3 = command.coordinates[0];
            //roundedPath.push(command);
            if ( point1 && point2 && point3 ) {
                angle = computeAngleAtCorner(point1, point2, point3);
                distance = computeLengthFromAngleToTangencyPoint(radius, angle/2);  // it is 1/2 times angle because we compute the adjacent side of the right triangle
            }
            if ( distance !== 0 && point2 && xCoordinatesToIgnore.indexOf(point2.x) === -1 ) {
                roundedPath[roundedPath.length - 1].coordinates[0] = computeNewStoppingPointForRoundingEffect(point1, point2, distance);
                offsetPoint = computeNewStoppingPointForRoundingEffect(point3, point2, distance);
                roundedPath.push({
                    command: 'S',
                    coordinates: [point2, offsetPoint]
                });
            }
            roundedPath.push(command);
        });

        roundedPath = roundedPath.map(function (action) {
            return action.command + action.coordinates.map(function(d) { return d.x + ',' + d.y; }).join(' ');
        }).join('');

        // Find out where the corners are and compute the angle at these corners, then based on these angles compute the distance where to start rounding.
        return roundedPath;
    };

    /**
     * Split the path string into its component commands with the coordinates for each point as an object in form of {x, y}.
     * @param {string} path - The path to be split.
     * @returns {Array} The split path by its constituent commands and coordinates for points defined as an object with x,y props.
     */
    function splitPathByCommands ( path ) {

        /**
         * Decompose a command from an svg path into its proper command action and the coordinates of the point to where the action is directed.
         * @param {string} command - The command in form of `<Action><x>,<y>`. For now, only one pair of coordinates is supported.
         * @returns {Object} The object that contains the command and coordinates of the points.
         */
        function splitCommandIntoComponents ( command ) {
            var cmd = command[0];
            var coordinates = command.substring(1).split(' ').map(function (c) {
                var coords = c.split(',');  // TODO deal with the case when there are several numbers separated by a space only (no commas)
                return {
                    x: parseInt(coords[0]),
                    y: parseInt(coords[1])
                };
            });
            return {
                command: cmd,
                coordinates: coordinates
            };
        }

        var re = /[A-Za-z][\d\s,]*/g;
        //console.log('M407,111L407,81S407,71 417,71L467,71S477,71 477,81L477,111'.match(re));
        return path.match(re).map(splitCommandIntoComponents);
    }

    /**
     * Compute the angle that is formed by the coordinates of 3 points.
     * @param {Object} point1
     * @param {Object} point2
     * @param {Object} point3
     * @returns {number} The angle in radians.
     */
    function computeAngleAtCorner ( point1, point2, point3 ) {
        var angle1 = Math.atan2(point1.y - point2.y, point1.x - point2.x);
        var angle2 = Math.atan2(point2.y - point3.y, point2.x - point3.x);
        return Math.abs(angle1) - Math.abs(angle2);
    }

    /**
     * Compute the length of the adjacent side of a right triangle.
     * @param {number} radius - The radius of the rounded border.
     * @param {number} angle - The angle in radians
     * @returns {number} The length of the side from the angle vertex to the tangency point.
     */
    function computeLengthFromAngleToTangencyPoint (radius, angle) {
        return radius / Math.tan(angle);
    }

    /**
     * Compute point coordinates before the angle vertex where the rounding should start/end.
     * @param {Object} point1
     * @param {Object} point2
     * @param {number} distance - The distance from the angle vertex to the point where rounding should start/end.
     * @returns {Object} The coordinates of the point where the rounding should start/end.
     */
    function computeNewStoppingPointForRoundingEffect (point1, point2, distance) {
        function computeDistanceBetweenPoints ( point1, point2 ) {
            return Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2));
        }

        var d = computeDistanceBetweenPoints(point1, point2),
            newPoint = {},
            direction = distance > 0 ? 1 : -1;
        newPoint.x = parseFloat((point2.x + direction * distance / d * (point1.x - point2.x)).toFixed(2));
        newPoint.y = parseFloat((point2.y + direction * distance / d * (point1.y - point2.y)).toFixed(2));

        return newPoint;
    }
})();