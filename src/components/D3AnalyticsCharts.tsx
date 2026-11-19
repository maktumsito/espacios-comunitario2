import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

function useContainerWidth(ref: React.RefObject<HTMLDivElement | null>, fallbackWidth: number): number {
  const [width, setWidth] = useState<number>(fallbackWidth);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const initial = el.clientWidth;
    if (initial > 0) setWidth(initial);
    if (typeof ResizeObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect?.width || 0);
      if (next <= 0) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        setWidth((prev) => (prev === next ? prev : next));
      }, 150);
    });
    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [ref]);
  return width;
}

interface SpaceData {
  id: string;
  name: string;
  count: number;
  participants: number;
  color?: string;
  percentage: string;
}

interface ActivityData {
  type: string;
  count: number;
  percentage: string;
}

interface D3SpaceBarChartProps {
  data: SpaceData[];
}

export const D3SpaceBarChart: React.FC<D3SpaceBarChartProps> = ({ data }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const measuredWidth = useContainerWidth(containerRef, 450);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    name: string;
    count: number;
    participants: number;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current || !data || data.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth || measuredWidth || 450;
    const height = Math.max(260, data.length * 36 + 40);
    const margin = { top: 15, right: 50, bottom: 25, left: 110 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Remove any previous SVG
    d3.select(container).selectAll('svg').remove();

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('class', 'overflow-visible font-sans');

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const maxVal = d3.max(data, d => d.count) || 1;

    // Scales
    const yScale = d3
      .scaleBand()
      .domain(data.map(d => d.name))
      .range([0, innerHeight])
      .padding(0.28);

    const xScale = d3
      .scaleLinear()
      .domain([0, Math.ceil(maxVal * 1.15) || 1])
      .range([0, innerWidth]);

    // Grid lines
    g.append('g')
      .attr('class', 'grid text-slate-200')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(5)
          .tickSize(-innerHeight)
          .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', '#f1f5f9')
      .attr('stroke-dasharray', '2,2');

    // Y Axis
    g.append('g')
      .call(d3.axisLeft(yScale).tickSize(0))
      .selectAll('text')
      .attr('class', 'text-xs font-semibold fill-slate-700')
      .style('text-anchor', 'end')
      .attr('dx', '-8px');

    g.select('.domain').remove();

    // Bars
    const barGroups = g
      .selectAll('.bar-group')
      .data(data)
      .enter()
      .append('g')
      .attr('class', 'bar-group cursor-pointer');

    // Background track
    barGroups
      .append('rect')
      .attr('y', d => yScale(d.name) || 0)
      .attr('height', yScale.bandwidth())
      .attr('x', 0)
      .attr('width', innerWidth)
      .attr('rx', 5)
      .attr('fill', '#f8fafc');

    // Value bar
    barGroups
      .append('rect')
      .attr('y', d => yScale(d.name) || 0)
      .attr('height', yScale.bandwidth())
      .attr('x', 0)
      .attr('width', 0)
      .attr('rx', 5)
      .attr('fill', d => d.color || '#3b82f6')
      .attr('opacity', 0.9)
      .on('mouseenter', (event, d) => {
        const bounds = container.getBoundingClientRect();
        setTooltip({
          visible: true,
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top - 10,
          name: d.name,
          count: d.count,
          participants: d.participants
        });
      })
      .on('mousemove', (event, d) => {
        const bounds = container.getBoundingClientRect();
        setTooltip(prev => (prev ? {
          ...prev,
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top - 10
        } : null));
      })
      .on('mouseleave', () => {
        setTooltip(null);
      })
      .transition()
      .duration(650)
      .attr('width', d => xScale(d.count));

    // Value labels
    barGroups
      .append('text')
      .attr('y', d => (yScale(d.name) || 0) + yScale.bandwidth() / 2 + 4)
      .attr('x', d => xScale(d.count) + 8)
      .attr('class', 'text-xs font-bold font-mono fill-slate-600')
      .text(d => `${d.count}`);

    // X Axis
    const xAxis = d3.axisBottom(xScale).ticks(5).tickFormat(d3.format('d'));
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .selectAll('text')
      .attr('class', 'text-[11px] font-mono fill-slate-500');

    g.select('.domain').attr('stroke', '#e2e8f0');
  }, [data, measuredWidth]);

  return (
    <div className="relative w-full overflow-hidden">
      <div ref={containerRef} className="w-full min-h-[260px]" />
      {tooltip && tooltip.visible && (
        <div
          className="absolute z-20 pointer-events-none bg-slate-900/95 text-white text-xs rounded-lg py-1.5 px-2.5 shadow-xl border border-slate-700/80 -translate-x-1/2 -translate-y-full backdrop-blur-xs transition-transform duration-75"
          style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }}
        >
          <div className="font-bold text-sky-300">{tooltip.name}</div>
          <div className="text-[11px] text-slate-300 font-mono">
            {tooltip.count} reservas · {tooltip.participants} participantes
          </div>
        </div>
      )}
    </div>
  );
};

interface D3ActivityDonutChartProps {
  data: ActivityData[];
}

export const D3ActivityDonutChart: React.FC<D3ActivityDonutChartProps> = ({ data }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const measuredWidth = useContainerWidth(containerRef, 340);
  const [activeItem, setActiveItem] = useState<ActivityData | null>(null);

  const total = data.reduce((acc, curr) => acc + curr.count, 0);

  useEffect(() => {
    if (!containerRef.current || !data || data.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth || measuredWidth || 340;
    const height = 260;
    const radius = Math.min(width, height) / 2 - 15;
    const innerRadius = radius * 0.58;

    d3.select(container).selectAll('svg').remove();

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('class', 'overflow-visible font-sans');

    const g = svg
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    const colorScale = d3
      .scaleOrdinal<string>()
      .domain(data.map(d => d.type))
      .range([
        '#6366f1', // Indigo
        '#3b82f6', // Blue
        '#06b6d4', // Cyan
        '#10b981', // Emerald
        '#f59e0b', // Amber
        '#ec4899', // Pink
        '#8b5cf6', // Violet
        '#64748b'  // Slate
      ]);

    const pie = d3
      .pie<ActivityData>()
      .value(d => d.count)
      .sort(null)
      .padAngle(0.025);

    const arc = d3
      .arc<d3.PieArcDatum<ActivityData>>()
      .innerRadius(innerRadius)
      .outerRadius(radius)
      .cornerRadius(5);

    const arcHover = d3
      .arc<d3.PieArcDatum<ActivityData>>()
      .innerRadius(innerRadius - 2)
      .outerRadius(radius + 7)
      .cornerRadius(6);

    const arcs = g
      .selectAll('.arc')
      .data(pie(data.filter(d => d.count > 0)))
      .enter()
      .append('g')
      .attr('class', 'arc cursor-pointer');

    arcs
      .append('path')
      .attr('d', arc as any)
      .attr('fill', d => colorScale(d.data.type))
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 2)
      .on('mouseenter', function (event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('d', arcHover as any)
          .attr('opacity', 1);
        setActiveItem(d.data);
      })
      .on('mouseleave', function () {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('d', arc as any)
          .attr('opacity', 0.95);
        setActiveItem(null);
      });
  }, [data, measuredWidth]);

  return (
    <div className="relative w-full flex flex-col items-center justify-center">
      <div ref={containerRef} className="w-full min-h-[260px] flex justify-center" />
      {/* Center text in donut */}
      <div className="absolute top-[130px] -translate-y-1/2 flex flex-col items-center justify-center pointer-events-none text-center">
        <span className="text-2xl font-black text-slate-900 leading-none">
          {activeItem ? activeItem.count : total}
        </span>
        <span className="text-[11px] text-slate-500 font-semibold mt-1">
          {activeItem ? activeItem.type : 'Reservas'}
        </span>
        {activeItem && (
          <span className="text-[10px] text-indigo-600 font-bold font-mono">
            {activeItem.percentage}%
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap justify-center gap-2 max-w-sm">
        {data
          .filter(d => d.count > 0)
          .map(d => (
            <div
              key={d.type}
              className="flex items-center space-x-1.5 text-xs text-slate-700 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200"
            >
              <span className="font-medium">{d.type}:</span>
              <span className="font-bold font-mono text-slate-900">{d.count}</span>
            </div>
          ))}
      </div>
    </div>
  );
};

interface D3HourlyOccupancyChartProps {
  reservations: { horaInicio?: string; horaFin?: string }[];
}

export const D3HourlyOccupancyChart: React.FC<D3HourlyOccupancyChartProps> = ({ reservations }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const measuredWidth = useContainerWidth(containerRef, 500);

  // Generate hourly occupancy between 08:00 and 22:00
  const hours = Array.from({ length: 15 }, (_, i) => i + 8); // 8 to 22

  const hourlyData = hours.map(hour => {
    const timeNum = hour * 60;
    const count = reservations.filter(r => {
      if (!r.horaInicio || !r.horaFin) return false;
      const [sh, sm] = r.horaInicio.split(':').map(Number);
      const [eh, em] = r.horaFin.split(':').map(Number);
      const sMin = (sh || 0) * 60 + (sm || 0);
      let eMin = (eh || 0) * 60 + (em || 0);
      if (eMin <= sMin) eMin += 1440;
      return timeNum >= sMin && timeNum < eMin;
    }).length;

    return {
      hour: `${hour.toString().padStart(2, '0')}:00`,
      count
    };
  });

  useEffect(() => {
    if (!containerRef.current || hourlyData.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth || measuredWidth || 500;
    const height = 180;
    const margin = { top: 20, right: 25, bottom: 30, left: 35 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    d3.select(container).selectAll('svg').remove();

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('class', 'overflow-visible font-sans');

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const maxCount = d3.max(hourlyData, d => d.count) || 1;

    // Scales
    const xScale = d3
      .scalePoint()
      .domain(hourlyData.map(d => d.hour))
      .range([0, innerWidth]);

    const yScale = d3
      .scaleLinear()
      .domain([0, Math.ceil(maxCount * 1.25) || 1])
      .range([innerHeight, 0]);

    // Gradient
    const defs = svg.append('defs');
    const gradient = defs
      .append('linearGradient')
      .attr('id', 'd3-area-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    gradient
      .append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#3b82f6')
      .attr('stop-opacity', 0.45);

    gradient
      .append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#3b82f6')
      .attr('stop-opacity', 0.02);

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(4)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', '#f1f5f9')
      .attr('stroke-dasharray', '2,2');

    // Area
    const area = d3
      .area<{ hour: string; count: number }>()
      .x(d => xScale(d.hour) || 0)
      .y0(innerHeight)
      .y1(d => yScale(d.count))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(hourlyData)
      .attr('fill', 'url(#d3-area-gradient)')
      .attr('d', area);

    // Line
    const line = d3
      .line<{ hour: string; count: number }>()
      .x(d => xScale(d.hour) || 0)
      .y(d => yScale(d.count))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(hourlyData)
      .attr('fill', 'none')
      .attr('stroke', '#2563eb')
      .attr('stroke-width', 2.5)
      .attr('d', line);

    // Dots
    g.selectAll('.dot')
      .data(hourlyData)
      .enter()
      .append('circle')
      .attr('class', 'dot')
      .attr('cx', d => xScale(d.hour) || 0)
      .attr('cy', d => yScale(d.count))
      .attr('r', 3.5)
      .attr('fill', '#ffffff')
      .attr('stroke', '#2563eb')
      .attr('stroke-width', 2);

    // X Axis
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(xScale)
          .tickValues(hourlyData.filter((_, idx) => idx % 2 === 0).map(d => d.hour))
      )
      .selectAll('text')
      .attr('class', 'text-[10px] font-mono fill-slate-500');

    // Y Axis
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(4).tickFormat(d3.format('d')))
      .selectAll('text')
      .attr('class', 'text-[10px] font-mono fill-slate-500');

    g.selectAll('.domain').attr('stroke', '#e2e8f0');
  }, [reservations, measuredWidth]);

  return (
    <div className="w-full">
      <div ref={containerRef} className="w-full min-h-[180px]" />
    </div>
  );
};
