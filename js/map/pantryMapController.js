/**
 * PantryMapControllers handle data fetching and filter processing for food resources.
 *  
 * Dependencies:
 *  - core/mappingCore 
 *  - core/util
 *  - core/geocoder
 *  - core/pantryDataService
*/
class PantryMapController {
    
    constructor(map) {
        this.cityOptions = [];
        this.map = map;
        
        this._data = [];
        this._sideBarData =  [];      // Sidebar shows only a portion of results, updated on scroll
        this._filteredData = [];
        this._filters = [];           // Type mappingCore.Filter
        this._dataLoaded = false;
        this._dataService = new PantryDataService();
        
        this._setLegend();
        this._setSidebarScrollListener();
    }

    start(loadCallback) {
        this._dataService.getCities().then((cities) => {
            this.cityOptions = cities;
        }).always(() => {
            this._getData(loadCallback);
        });
    }

    // Filter access methods
    setCategoryFilter(filterArray) {
        this._setFilter(new Filter("Category", filterArray, FilterType.multi));
    }
    getCategoryFilter() {
        const filter = this._filters.find(f => f.field === "Category");
        return filter ? filter.value : [];
    }
    clearCategoryFilter(){
        this._filters = this._filters.filter(f => f.field !== "Category")
    }
    
    setRadiusFilter(zipCode, geopointCenter, radius) {
        this._setFilter(new Filter("Radius", {zipCode: zipCode, geoPoint: geopointCenter, radius: radius}, FilterType.geoPoint));
    }
    getRadiusFilter() {
        const filter = this._filters.find(f => f.field === "Radius");
        return filter ? filter.value : {zipCode: null, geoPoint: null, radius: 10};
    }
    clearRadiusFilter(){
        this._filters = this._filters.filter(f => f.field !== "Radius")
    }
    //end filter access methods


    _getData(successCallback) {
        this._dataService.getFoodResources().then((foodResources) => {
            this._data = foodResources.filter(fr => fr.IsActive);
            if (this._dataLoaded)
                this._applyFilters();
            else {
                successCallback();     
            }
            
            this._dataLoaded = true;
        });
    }

    _setLegend() {
        let div = L.DomUtil.create('div', 'legend');
        div.innerHTML += '<div style="background-color:white;>';
        div.innerHTML += `<img src=${MarkerIcon.getPath(MarkerIcon.Grocery)} alt="Food Pantry"/> &ndash; Food Pantry <br>`;
        div.innerHTML += `<img src=${MarkerIcon.getPath(MarkerIcon.Restaurant)} alt="Meal Site"/> &ndash; Meal Site <br>`;
        div.innerHTML += '</div>'; 
        this.map.addLegend(div);
    }

    _refreshMapAndSideBar() {
        this.map.clearMarkers();
        this._buildMapMarkers(this._filteredData);
        this._sideBarData = this._filteredData.slice(0, 20);
        this._buildSidebarListing(this._sideBarData);
    }

    _setSidebarScrollListener() {
        document.getElementById('map-results-list').onscroll = (e) =>  {;
            const minPassed =  parseInt(e.target.scrollTop/150);
            let end = Math.min(this._filteredData.length, minPassed + 20);
            this._sideBarData = this._filteredData.slice(0, end);
            this._buildSidebarListing(this._sideBarData);
        };
    }

    _applyFilters() {
        this._filteredData = this._data;
        this._filters.filter(f => !Util.isNullOrEmpty(f.value)).forEach(f => {
            if (f.filterType == FilterType.single) {
                this._filteredData = this._filteredData.filter(d => d[f.field].indexOf(f.value) >= 0);
            } else if (f.filterType == FilterType.multi) {
                this._filteredData = this._filteredData.filter(d => f.value.indexOf(d[f.field]) >= 0);
            } else if (f.filterType == FilterType.geoPoint) {
                const radiusInKM = parseInt(f.value.radius)*1.6093;
                this._filteredData = this._filteredData.filter(d => new GeoPoint(d.Latitude, d.Longitude).distanceTo(f.value.geoPoint) <= radiusInKM);
            } else {
                console.error("Invalid filter: ", f);
            }
        });

        this._refreshMapAndSideBar();
    }

    /**
        Set filter value(s) for a field. Removes any existing filters for the field first.
        @param filter: Filter of type mappingCore.Filter to apply
    */ 
    _setFilter(filter) {
        if (!Util.isNullOrEmpty(filter)) {
            this._filters = this._filters.filter(f => f.field !== filter.field);
            this._filters.push(filter);
            this._applyFilters();
            this.map.fitMarkerBounds();
        }
    }

    _buildMapMarkers(foodResourceArray) {
        for (let foodResource of foodResourceArray) {
            if (foodResource.Latitude && foodResource.Longitude) {
                if (this.map.markers[foodResource.Address]) { // If marker already known by map, don't add it again.
                    //Think harder about this. It seems like it shouldn't be needed.
                    this.map.addMarkerPopup(foodResource.Address, this._getMarkerPopupHtml(foodResource));
                } else {
                    this.map.addMarker(new GeoPoint(foodResource.Latitude, foodResource.Longitude), foodResource.Address, this._getIcon(foodResource));
                    this.map.addMarkerPopup(foodResource.Address, this._getMarkerPopupHtml(foodResource));
                }
            }
        }
    }

    _getIcon(foodResource) {
        if (foodResource.IconUrl) {
            return L.icon({
                iconUrl: foodResource.IconUrl,
                iconSize:     [32, 37], // size of the icon
                iconAnchor:   [22, 36], // point of the icon which will correspond to marker's location
                popupAnchor:  [-3, -36] // point from which the popup should open relative to the iconAnchor
            });
        }

        return null;
    }

    _buildSidebarListing(foodResourceArray) {
        let target = document.getElementById('map-results-list');
        let src = document.getElementById('list-result-template').innerHTML;
        let template = Handlebars.compile(src);
        target.innerHTML = template(foodResourceArray);

        this._setSidebarHeader();
        const sidebarHeadingHeight = $("#sidebar-heading").height()+8;
        $("#map-result-spacer").css("height", sidebarHeadingHeight+"px");
        $("#map-results-list").css("height", ($("#map-list-wrapper").height()-sidebarHeadingHeight-12)+"px");
    }

    _setSidebarHeader() {
        const filterBadges = ['<div class="small"><strong>Current filters</strong></div>'];
        for (let filter of this._filters) {
            if (filter.filterType == FilterType.single && !Util.isNullOrEmpty(filter.value)) {
                filterBadges.push(`<span class="badge badge-info filter-badge">${filter.field}: ${filter.value}</span>`);
            }
            if (filter.filterType == FilterType.multi && !Util.isNullOrEmpty(filter.value)) {
                filter.value.forEach(value => filterBadges.push(`<span class="badge badge-info filter-badge">${filter.field}: ${value}</span>`));
            }
            if (filter.filterType == FilterType.geoPoint) {
                filterBadges.push(`<span class="badge badge-info filter-badge">${filter.value.zipCode} (${filter.value.radius}mi)</span>`);
            }
        }

        $("#sidebar-heading").html(filterBadges.join(''));
    }
    
    _getMarkerPopupHtml(foodResource) {
        let components = [
            `<span style="font-size:1.1rem">${foodResource.Name}</span><br>`,
            `<hr style="margin-top: 0; margin-bottom: 4px;">`,
            `<span><b>Category: </b>${foodResource.Category}</span><br>`,
            `<span><b>Phone: </b><a href="tel:${Util.telFormat(foodResource.Phone)}">${foodResource.Phone}</a></span><br>`,
        ];

        if (!Util.isNullOrEmpty(foodResource.WebLink)) {
            components.push(`<span><b>Website: </b><a href='${foodResource.WebLink}' target='_blank'>${foodResource.WebLink}</a></span><br>`);
        }
        
        if (!Util.isNullOrEmpty(foodResource.WebLink2)) {
            components.push(`<span><b>Website 2: </b><a href='${foodResource.WebLink}' target='_blank'>${foodResource.WebLink}</a></span><br>`);
        }
        
        components.push(`<span><b>Address: </b>${foodResource.Address}</span><br>`);
        
        if (!Util.isNullOrEmpty(foodResource.SpecialHoursOfOperation)) {
            components.push(`<span><b>Covid-19 Hours: </b>${foodResource.SpecialHoursOfOperation}</span><br>`);   
        } else if (!Util.isNullOrEmpty(foodResource.HoursOfOperation)) {
            components.push(`<span><b>Hours: </b>${foodResource.HoursOfOperation}</span><br>`);
        }

        if (!Util.isNullOrEmpty(foodResource.SpecialNotes)) {
            components.push(`<span><b>Covid-19 Notes: </b>${foodResource.SpecialNotes}</span><br>`);   
        }
        
        if (!Util.isNullOrEmpty(foodResource.OperationalNotes)) {
            components.push(`<span><b>Notes: </b>${foodResource.OperationalNotes}</span><br>`);
        }
        
        return components.join('');
    }
}